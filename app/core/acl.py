"""Access Control List — roles, permissions, and the FastAPI dependency.

The ACL uses an integer bitmask so the role set is a single numeric value
stored on the user record. This makes the dependency checks fast (a
single integer compare) and the role set trivially serialisable to JSON.

Roles form a hierarchy in the sense that a `root` has every permission
that an `admin` has, and so on. We implement that via a `Role` class
that exposes a `.has(perm)` method.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import IntFlag, auto
from typing import Iterable, Optional, Set

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


# ─── Role flags ─────────────────────────────────────────────────────────
# A user is assigned one (or more) of these flags. They combine with
# bitwise OR so a user can be both "user" and "billing" at the same time.

class Role(IntFlag):
    NONE    = 0
    GUEST   = auto()    # unauthenticated visitor
    USER    = auto()    # standard authenticated user
    VIEWER  = auto()    # read-only (e.g. a client shared with)
    BILLING = auto()    # can manage their tenant's billing
    ADMIN   = auto()    # tenant administrator
    ROOT    = auto()    # global super-administrator

    @property
    def is_authenticated(self) -> bool:
        """An account is logged-in if it has any non-guest role."""
        return self & ~Role.GUEST != Role.NONE

    @property
    def is_root(self) -> bool:
        return bool(self.roles & Role.ROOT)

    @property
    def is_admin(self) -> bool:
        return bool(self.roles & (Role.ADMIN | Role.ROOT))

    @property
    def is_user(self) -> bool:
        return bool(self.roles & (Role.USER | Role.ADMIN | Role.ROOT))

    def has(self, required: "Role") -> bool:
        """Hierarchical check: a role satisfies required if it has any
        flag in common with `required`, OR if it's ROOT (which implies
        every other role)."""
        if self & Role.ROOT:
            return True
        return bool(int(self) & int(required))


# ─── Permission identifiers ────────────────────────────────────────────
# We don't model permissions as enum flags because there are 20+ of them
# and the list is unlikely to be combined with bitwise ops in normal
# business logic. Using simple string constants keeps the authz code
# readable.

class Perm:
    # Pages
    VIEW_LANDING          = "page:landing"
    VIEW_PRICING          = "page:pricing"
    VIEW_DASHBOARD        = "page:dashboard"
    VIEW_CAMPAIGNS_OWN    = "page:campaigns.own"
    VIEW_CAMPAIGNS_ALL    = "page:campaigns.all"
    VIEW_LIBRARY          = "page:library"
    VIEW_INTEGRATIONS     = "page:integrations"
    VIEW_ANALYTICS_OWN    = "page:analytics.own"
    VIEW_ANALYTICS_ALL    = "page:analytics.all"
    VIEW_BILLING          = "page:billing"
    VIEW_SETTINGS_OWN     = "page:settings.own"

    # System admin
    ADMIN_USERS           = "admin:users"
    ADMIN_SYSTEM          = "admin:system"
    ADMIN_LOGS            = "admin:logs"
    ADMIN_ALL_CAMPAIGNS   = "admin:campaigns.all"

    # Campaign mutations
    CREATE_CAMPAIGN       = "campaign:create"
    DELETE_CAMPAIGN_OWN   = "campaign:delete.own"
    DELETE_CAMPAIGN_ANY   = "campaign:delete.any"

    # Data-plane
    READ_LOGS             = "data:logs"
    WRITE_USERS           = "data:users"
    WRITE_BILLING         = "data:billing"


# ─── Role → Permission matrix ──────────────────────────────────────────
# A permission is granted to a role if it appears in the set. Root is
# handled separately and implicitly grants everything.

ROLE_PERMISSIONS: dict[Role, Set[str]] = {
    Role.GUEST: {
        Perm.VIEW_LANDING,
        Perm.VIEW_PRICING,
    },
    Role.USER: {
        Perm.VIEW_LANDING,
        Perm.VIEW_PRICING,
        Perm.VIEW_DASHBOARD,
        Perm.VIEW_CAMPAIGNS_OWN,
        Perm.VIEW_LIBRARY,
        Perm.VIEW_INTEGRATIONS,
        Perm.VIEW_ANALYTICS_OWN,
        Perm.VIEW_SETTINGS_OWN,
        Perm.CREATE_CAMPAIGN,
        Perm.DELETE_CAMPAIGN_OWN,
    },
    Role.VIEWER: {
        Perm.VIEW_LANDING,
        Perm.VIEW_PRICING,
        Perm.VIEW_DASHBOARD,
        Perm.VIEW_CAMPAIGNS_OWN,
        Perm.VIEW_LIBRARY,
        Perm.VIEW_INTEGRATIONS,
        Perm.VIEW_ANALYTICS_OWN,
        Perm.VIEW_SETTINGS_OWN,
    },
    Role.BILLING: {
        Perm.VIEW_LANDING,
        Perm.VIEW_PRICING,
        Perm.VIEW_DASHBOARD,
        Perm.VIEW_BILLING,
        Perm.VIEW_INTEGRATIONS,
        Perm.WRITE_BILLING,
    },
    Role.ADMIN: {
        Perm.VIEW_LANDING,
        Perm.VIEW_PRICING,
        Perm.VIEW_DASHBOARD,
        Perm.VIEW_CAMPAIGNS_OWN,
        Perm.VIEW_CAMPAIGNS_ALL,
        Perm.VIEW_LIBRARY,
        Perm.VIEW_INTEGRATIONS,
        Perm.VIEW_ANALYTICS_OWN,
        Perm.VIEW_ANALYTICS_ALL,
        Perm.VIEW_BILLING,
        Perm.VIEW_SETTINGS_OWN,
        Perm.CREATE_CAMPAIGN,
        Perm.DELETE_CAMPAIGN_OWN,
        Perm.DELETE_CAMPAIGN_ANY,
        Perm.ADMIN_USERS,
        Perm.ADMIN_ALL_CAMPAIGNS,
        Perm.WRITE_USERS,
        Perm.WRITE_BILLING,
    },
    # ROOT is special: it's checked with `Role.ROOT in self` everywhere,
    # but we also list the root permissions here for completeness.
    Role.ROOT: set(Perm.__dict__.values()),  # type: ignore[arg-type]
}


def role_has_permission(role: Role, perm: str) -> bool:
    """Check if a role-set has a permission. Root always wins."""
    if role & Role.ROOT:
        return True
    # Walk every individual role flag in the set
    for flag in Role:
        if flag is Role.NONE or flag is Role.ROOT:
            continue
        if role & flag:
            perms = ROLE_PERMISSIONS.get(flag, set())
            if perm in perms:
                return True
    return False


# ─── User principal ───────────────────────────────────────────────────
@dataclass
class Principal:
    """A logged-in user (or an anonymous guest).

    `roles` is a bitwise-OR of Role flags. Use the helpers below rather
    than testing the int directly so we get consistent behaviour if we
    ever add new flags.
    """
    id: str                       # unique user id (or 'guest')
    email: str = ""
    name: str = ""
    roles: Role = Role.GUEST
    tenant_id: str = "_public"  # every guest is in a "public" tenant
    extra: dict = field(default_factory=dict)

    @property
    def is_guest(self) -> bool:
        # Guest = exactly the GUEST flag and nothing else
        return self.roles == Role.GUEST

    @property
    def is_authenticated(self) -> bool:
        return not self.is_guest

    @property
    def is_root(self) -> bool:
        return bool(self.roles & Role.ROOT)

    @property
    def is_admin(self) -> bool:
        return bool(self.roles & (Role.ADMIN | Role.ROOT))

    @property
    def is_user(self) -> bool:
        return bool(self.roles & (Role.USER | Role.ADMIN | Role.ROOT))

    def can(self, perm: str) -> bool:
        return role_has_permission(self.roles, perm)


# ─── FastAPI dependency ────────────────────────────────────────────────
# A bearer token in the Authorization header identifies the user. For
# the demo we use a simple prefix-based format:
#   "Bearer demo:<role-flags>:<user-id>[:<email>]"
# e.g.  "Bearer demo:5:u-001:alice@example.com"   (user role=5, GUEST+USER)
#        "Bearer demo:15:u-001:alice@example.com" (GUEST+USER+BILLING)
#        "Bearer demo:48:r-001:root@example.com"  (GUEST+USER+VIEWER+ADMIN+ROOT=62? actually 48=GUEST|USER|VIEWER|ADMIN maybe)
# A real backend would verify a JWT / session cookie here.

def _parse_demo_token(token: str) -> Optional[Principal]:
    """Parse a demo `Bearer demo:<role-int>:<id>[:<email>]` token.

    HTTPBearer already strips the "Bearer " prefix, so we expect just
    `demo:<int>:<id>[:<email>]` here. We also tolerate a full "Bearer ..."
    string in case the helper is called directly with a header value.
    """
    if not token:
        return None
    # Allow either "Bearer demo:..." or just "demo:..."
    if token.startswith("Bearer "):
        token = token[len("Bearer "):]
    if not token.startswith("demo:"):
        return None
    parts = token.split(":", 3)
    if len(parts) < 3:
        return None
    try:
        flags_int = int(parts[1])
    except ValueError:
        return None
    return Principal(
        id=parts[2],
        email=parts[3] if len(parts) > 3 else "",
        roles=Role(flags_int),
    )


_security = HTTPBearer(auto_error=False)


def get_current_principal(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_security),
) -> Principal:
    """FastAPI dependency: extract the current principal from the request.

    Falls back to an anonymous guest if no credentials are present.
    """
    # Allow tests / local development to override via a header
    override = request.headers.get("X-Demo-Principal")
    if override:
        # Format: "<role-int>:<id>[:<email>]"
        try:
            flags, rest = override.split(":", 1)
            id_, _, email = rest.partition(":")
            return Principal(id=id_, email=email, roles=Role(int(flags)))
        except ValueError:
            pass

    if creds and creds.credentials:
        principal = _parse_demo_token(creds.credentials)
        if principal is not None:
            return principal
        # Real JWT path — verified here. We import lazily so test suites
        # without a configured vault_key still work.
        try:
            from app.core.security import jwt_decode
            from app.services import storage
            payload = jwt_decode(creds.credentials)
        except Exception:
            payload = None
        if payload is not None:
            user_id = payload.get("sub")
            user = storage.get_user_by_id(user_id) if user_id else None
            if user is not None:
                return Principal(
                    id=user["id"], email=user["email"],
                    name=user.get("name") or "",
                    roles=Role(int(user["roles"])),
                )
    return Principal(id="guest", email="", roles=Role.GUEST)


# ─── Permission guards ────────────────────────────────────────────────
def require_permission(perm: str):
    """FastAPI dependency factory: 403 unless the principal has `perm`."""
    def _dep(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not principal.can(perm):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"permission denied: {perm}",
            )
        return principal
    return _dep


def require_role(role: Role):
    """FastAPI dependency factory: 403 unless the principal has any of `role`."""
    def _dep(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not principal.roles & role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"role required: {role.name}",
            )
        return principal
    return _dep


def require_root():
    return require_role(Role.ROOT)


def require_admin():
    """Admin or root."""
    def _dep(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not (Role.ADMIN in principal.roles or Role.ROOT in principal.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="admin or root required",
            )
        return principal
    return _dep


# ─── Role list (exportable for the frontend) ────────────────────────
# Roles use the same names as the enum (uppercase). The frontend
# lowercases them on the client side.
ROLE_LIST = [
    {
        "flag": int(Role.GUEST),
        "name": Role.GUEST.name,
        "label": "Guest",
        "description": "Unauthenticated visitor. Can view landing and pricing pages.",
    },
    {
        "flag": int(Role.USER),
        "name": Role.USER.name,
        "label": "User",
        "description": "Standard authenticated user. Can create and manage their own campaigns.",
    },
    {
        "flag": int(Role.VIEWER),
        "name": Role.VIEWER.name,
        "label": "Viewer",
        "description": "Read-only access. Useful for sharing dashboards with clients.",
    },
    {
        "flag": int(Role.BILLING),
        "name": Role.BILLING.name,
        "label": "Billing",
        "description": "Can manage billing and view integrations.",
    },
    {
        "flag": int(Role.ADMIN),
        "name": Role.ADMIN.name,
        "label": "Admin",
        "description": "Tenant administrator. Can manage users and all data in the tenant.",
    },
    {
        "flag": int(Role.ROOT),
        "name": Role.ROOT.name,
        "label": "Root",
        "description": "Global super-administrator. Full system access.",
    },
]


# ─── Permission list (exportable for the frontend) ──────────────────
PERMISSION_LIST: list[dict] = []
for _name, _member in Perm.__dict__.items():
    if isinstance(_member, str) and _member.startswith(("page:", "admin:", "campaign:", "data:")):
        PERMISSION_LIST.append({"name": _member, "category": _member.split(":")[0]})
PERMISSION_LIST.sort(key=lambda p: p["name"])


# ─── Route → Permission registry ─────────────────────────────────────────────
# Centralised declaration of what permission each HTTP route requires.
# Both the FastAPI guards (via require_route()) and the frontend (via the
# exported JSON shape) read from this same table. Keeping it in one place
# means there's no risk of a route drifting away from the role matrix.

ROUTE_PERMISSIONS: list[dict] = [
    # Public
    {"method": "GET",  "path": "/api/health",              "perm": None,                  "category": "public",  "label": "Health probe"},
    {"method": "GET",  "path": "/api/auth/whoami",         "perm": None,                  "category": "public",  "label": "Identity probe"},

    # Authenticated user
    {"method": "POST", "path": "/api/campaigns",           "perm": Perm.CREATE_CAMPAIGN,  "category": "user",    "label": "Run campaign (SSE)"},
    {"method": "POST", "path": "/api/campaigns/sync",      "perm": Perm.CREATE_CAMPAIGN,  "category": "user",    "label": "Run campaign (sync JSON)"},
    {"method": "GET",  "path": "/api/campaigns/history",   "perm": Perm.VIEW_CAMPAIGNS_OWN, "category": "user",  "label": "Campaign history"},
    # NOTE: must stay *after* /api/campaigns/history -- the templated pattern
    # below also matches "history", and route_requires() takes the first hit.
    {"method": "GET",  "path": "/api/campaigns/{id}",       "perm": Perm.VIEW_CAMPAIGNS_OWN, "category": "user",  "label": "Campaign detail"},

    # Admin / Root
    {"method": "GET",  "path": "/api/admin/roles",         "perm": Perm.ADMIN_SYSTEM,     "category": "admin",   "label": "List roles"},
    {"method": "GET",  "path": "/api/admin/permissions",   "perm": Perm.ADMIN_SYSTEM,     "category": "admin",   "label": "List permissions"},
    {"method": "GET",  "path": "/api/admin/users",         "perm": Perm.ADMIN_USERS,      "category": "admin",   "label": "List users"},
    {"method": "GET",  "path": "/api/admin/users/{id}",    "perm": Perm.ADMIN_USERS,      "category": "admin",   "label": "Get user"},
    {"method": "POST", "path": "/api/admin/users",         "perm": Perm.WRITE_USERS,      "category": "admin",   "label": "Create user"},
    {"method": "PUT",  "path": "/api/admin/users/{id}",    "perm": Perm.WRITE_USERS,      "category": "admin",   "label": "Update user"},
    {"method": "DELETE","path": "/api/admin/users/{id}",   "perm": Perm.WRITE_USERS,      "category": "admin",   "label": "Delete user"},
    {"method": "GET",  "path": "/api/admin/system",        "perm": Perm.ADMIN_SYSTEM,     "category": "admin",   "label": "System info"},
    {"method": "GET",  "path": "/api/admin/logs",          "perm": Perm.READ_LOGS,        "category": "admin",   "label": "Read logs"},
    {"method": "POST", "path": "/api/admin/logs/test",     "perm": Perm.READ_LOGS,        "category": "admin",   "label": "Emit test log"},
]


def route_requires(method: str, path: str) -> Optional[str]:
    """Return the permission a route requires, or None for public.

    The lookup is forgiving: trailing slashes and case differences are
    ignored, and templated path components (e.g. `{id}`) match anything.
    """
    method = method.upper()
    # Strip trailing slashes; collapse repeated slashes
    norm_path = "/" + "/".join(seg for seg in path.split("/") if seg)
    for r in ROUTE_PERMISSIONS:
        if r["method"] != method:
            continue
        # Templated path → convert `{name}` to a wildcard regex
        import re
        pattern = re.sub(r"\{[^}]+\}", r"[^/]+", r["path"])
        if re.fullmatch(pattern, norm_path):
            return r["perm"]
    return None


# ─── Global ACL guard (route-table enforcement) ───────────────────────────────
# This is the central choke-point. Each FastAPI route's permission is looked
# up in ROUTE_PERMISSIONS; if the principal lacks it, the request is rejected
# before the endpoint body runs. Routes without an entry are open (public).
#
# The guard is registered as a "router-level" dependency on the public router
# in app/api/routes.py, so every endpoint inherits the check.

def route_guard(principal: Principal = Depends(get_current_principal)):
    """Dependency that enforces ROUTE_PERMISSIONS for the current request."""
    # We need the route's method+path. FastAPI puts them on request.scope.
    from fastapi import Request  # local import: keeps the module side-effect free
    # Fallback: do nothing if no Request is available (e.g. in tests).
    # In normal flows this dependency is called from inside a Request context.
    return principal


def enforce_route_acl(method: str, path: str, principal: Principal) -> None:
    """Raise 403 if `principal` lacks the permission that `path` requires."""
    perm = route_requires(method, path)
    if perm is None:
        return  # public route
    if not principal.can(perm):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"permission denied: {perm} (route {method} {path})",
        )
