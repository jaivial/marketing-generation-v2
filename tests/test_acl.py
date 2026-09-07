"""Tests for the ACL system: roles, permissions, dependencies."""
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.core.acl import (
    Role,
    Perm,
    Principal,
    ROLE_LIST,
    PERMISSION_LIST,
    ROLE_PERMISSIONS,
    require_permission,
    require_role,
    require_root,
    require_admin,
    get_current_principal,
    role_has_permission,
)


# ─── Role bitfield sanity ───────────────────────────────────────────
def test_role_values_unique():
    vals = [int(Role[r["name"]]) for r in ROLE_LIST]
    assert len(vals) == len(set(vals)), "Role bit values must be unique"


def test_role_list_matches_class():
    expected = {"GUEST", "USER", "VIEWER", "BILLING", "ADMIN", "ROOT"}
    got = {r["name"] for r in ROLE_LIST}
    assert got == expected, f"expected {expected}, got {got}"


# ─── Principal helpers ──────────────────────────────────────────────
def test_principal_is_guest():
    p = Principal(id="anon")
    assert p.is_guest
    assert not p.is_authenticated
    assert not p.is_root
    assert not p.is_admin


def test_principal_is_root():
    p = Principal(id="r-1", roles=Role.ROOT)
    assert p.is_root
    assert p.is_admin
    assert p.is_authenticated


def test_principal_is_admin_but_not_root():
    p = Principal(id="a-1", roles=Role.ADMIN)
    assert p.is_admin
    assert not p.is_root
    assert p.is_user


# ─── Permission matrix ─────────────────────────────────────────────
def test_root_has_every_permission():
    for perm_name, perm_value in Perm.__dict__.items():
        if isinstance(perm_value, str) and perm_value.startswith(("page:", "admin:", "campaign:", "data:")):
            assert role_has_permission(Role.ROOT, perm_value), f"root should have {perm_value}"


def test_guest_cannot_create():
    p = Principal(id="g", roles=Role.GUEST)
    assert not p.can(Perm.CREATE_CAMPAIGN)
    assert not p.can(Perm.ADMIN_USERS)
    assert p.can(Perm.VIEW_LANDING)
    assert p.can(Perm.VIEW_PRICING)


def test_user_can_create_but_not_admin():
    p = Principal(id="u", roles=Role.USER)
    assert p.can(Perm.CREATE_CAMPAIGN)
    assert p.can(Perm.DELETE_CAMPAIGN_OWN)
    assert not p.can(Perm.ADMIN_USERS)
    assert not p.can(Perm.READ_LOGS)


def test_admin_can_manage_users_but_not_read_logs():
    p = Principal(id="a", roles=Role.ADMIN)
    assert p.can(Perm.ADMIN_USERS)
    assert p.can(Perm.WRITE_USERS)
    assert p.can(Perm.CREATE_CAMPAIGN)
    assert not p.can(Perm.READ_LOGS)
    assert not p.can(Perm.ADMIN_SYSTEM)


def test_root_combined_role_inherits_admin_perms():
    p = Principal(id="r", roles=Role.GUEST | Role.ROOT)
    # Because Role.ROOT is present, all checks pass:
    assert p.can(Perm.ADMIN_USERS)
    assert p.can(Perm.READ_LOGS)
    assert p.can(Perm.ADMIN_SYSTEM)
    assert p.can(Perm.CREATE_CAMPAIGN)


def test_viewer_is_read_only_on_data():
    p = Principal(id="v", roles=Role.VIEWER)
    assert p.can(Perm.VIEW_DASHBOARD)
    assert p.can(Perm.VIEW_CAMPAIGNS_OWN)
    assert not p.can(Perm.CREATE_CAMPAIGN)
    assert not p.can(Perm.DELETE_CAMPAIGN_OWN)


def test_billing_role_can_only_view_billing():
    p = Principal(id="b", roles=Role.BILLING)
    assert p.can(Perm.VIEW_BILLING)
    assert p.can(Perm.WRITE_BILLING)
    assert not p.can(Perm.CREATE_CAMPAIGN)
    assert not p.can(Perm.ADMIN_USERS)


# ─── FastAPI dependency: require_permission ────────────────────────
def _make_app():
    app = FastAPI()

    @app.get("/public")
    def public_route():
        return {"ok": True}

    @app.get("/me")
    def me_route(principal: Principal = Depends(get_current_principal)):
        return {
            "id": principal.id,
            "email": principal.email,
            "name": principal.name,
            "roles": int(principal.roles),
            "is_authenticated": principal.is_authenticated,
            "is_admin": principal.is_admin,
            "is_root": principal.is_root,
        }

    @app.get("/private")
    def private_route(_: Principal = Depends(require_permission(Perm.ADMIN_USERS))):
        return {"ok": True}

    @app.get("/root-only")
    def root_route(_: Principal = Depends(require_root())):
        return {"ok": True}

    @app.get("/admin-or-above")
    def admin_route(_: Principal = Depends(require_admin())):
        return {"ok": True}

    return app


def _client():
    return TestClient(_make_app(), raise_server_exceptions=True)


def test_public_no_auth():
    c = _client()
    r = c.get("/public")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_whoami_anonymous():
    c = _client()
    r = c.get("/me")
    assert r.status_code == 200
    assert r.json()["id"] == "guest"
    assert r.json()["roles"] == int(Role.GUEST)


def test_whoami_with_token():
    c = _client()
    # USER role int = 2 (since GUEST=1, USER=2)
    r = c.get("/me", headers={"Authorization": "Bearer demo:2:u-001:alice@example.com"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "u-001"
    assert body["email"] == "alice@example.com"
    assert body["is_authenticated"]


def test_permission_required_blocks_anonymous():
    c = _client()
    r = c.get("/private")
    assert r.status_code == 403


def test_permission_required_allows_user_with_right_role():
    c = _client()
    # GUEST|USER|ADMIN = 1|2|16 = 19
    r = c.get("/private", headers={"Authorization": f"Bearer demo:{int(Role.GUEST | Role.USER | Role.ADMIN)}:a-1"})
    assert r.status_code == 200


def test_root_only_blocks_admin():
    c = _client()
    r = c.get("/root-only", headers={"Authorization": f"Bearer demo:{int(Role.ADMIN)}:a-1"})
    assert r.status_code == 403


def test_root_only_allows_root():
    c = _client()
    r = c.get("/root-only", headers={"Authorization": f"Bearer demo:{int(Role.ROOT)}:r-1"})
    assert r.status_code == 200


def test_admin_or_above_allows_admin():
    c = _client()
    r = c.get("/admin-or-above", headers={"Authorization": f"Bearer demo:{int(Role.ADMIN)}:a-1"})
    assert r.status_code == 200


# ─── Role export (used by the frontend) ────────────────────────────
def test_role_export_contains_all_roles():
    names = {r["name"] for r in ROLE_LIST}
    for n in ("GUEST", "USER", "VIEWER", "BILLING", "ADMIN", "ROOT"):
        assert n in names, f"role {n} missing from ROLE_LIST export"


def test_permission_export_categories():
    cats = {p["category"] for p in PERMISSION_LIST}
    assert "page" in cats
    assert "admin" in cats
    assert "campaign" in cats
    assert "data" in cats


def test_permission_export_sorted():
    names = [p["name"] for p in PERMISSION_LIST]
    assert names == sorted(names)


# ─── Global route-level ACL enforcement ───────────────────────────────────────
from app.core.acl import (
    ROUTE_PERMISSIONS, route_requires, enforce_route_acl,
)
from app.main import app as production_app

prod_client = TestClient(production_app)


def test_route_requires_returns_perm():
    assert route_requires("GET", "/api/admin/users") == Perm.ADMIN_USERS
    assert route_requires("GET", "/api/admin/users/u-1") == Perm.ADMIN_USERS
    assert route_requires("POST", "/api/campaigns") == Perm.CREATE_CAMPAIGN
    assert route_requires("GET", "/api/health") is None
    assert route_requires("GET", "/api/unknown") is None


def test_route_requires_normalizes_slashes():
    # Trailing slash and double-slash shouldn't matter
    assert route_requires("GET", "/api/admin/users/") == Perm.ADMIN_USERS
    assert route_requires("GET", "//api//admin//users//") == Perm.ADMIN_USERS


def test_production_admin_blocks_anonymous():
    r = prod_client.get("/api/admin/users")
    assert r.status_code == 403


def test_production_admin_blocks_regular_user():
    r = prod_client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer demo:{int(Role.USER)}:u-1"},
    )
    assert r.status_code == 403


def test_production_admin_blocks_admin_only():
    # ADMIN != ROOT
    r = prod_client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer demo:{int(Role.ADMIN)}:a-1"},
    )
    assert r.status_code == 403


def test_production_admin_allows_root():
    r = prod_client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer demo:{int(Role.ROOT)}:r-1"},
    )
    assert r.status_code == 200


def test_production_admin_logs_blocks_user():
    r = prod_client.get(
        "/api/admin/logs",
        headers={"Authorization": f"Bearer demo:{int(Role.ADMIN)}:a-1"},
    )
    assert r.status_code == 403


def test_production_admin_system_blocks_user():
    r = prod_client.get(
        "/api/admin/system",
        headers={"Authorization": f"Bearer demo:{int(Role.ADMIN)}:a-1"},
    )
    assert r.status_code == 403


def test_production_public_routes_are_open():
    r = prod_client.get("/api/health")
    assert r.status_code == 200
    r = prod_client.get("/api/auth/whoami")
    assert r.status_code == 200


def test_production_user_routes_require_auth():
    # No token => guest => 403
    r = prod_client.get("/api/campaigns/history")
    assert r.status_code == 403


def test_production_routes_endpoint_for_frontend():
    r = prod_client.get(
        "/api/admin/routes",
        headers={"Authorization": f"Bearer demo:{int(Role.ROOT)}:r-1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert any(e["path"] == "/api/admin/users" for e in body)


def test_production_acl_matrix_endpoint():
    r = prod_client.get(
        "/api/admin/acl/matrix",
        headers={"Authorization": f"Bearer demo:{int(Role.ROOT)}:r-1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "roles" in body and "permissions" in body and "routes" in body


def test_enforce_route_acl_passes_public():
    p = Principal(id="g")
    # No exception for public routes
    enforce_route_acl("GET", "/api/health", p)


def test_enforce_route_acl_raises_for_missing_perm():
    from fastapi import HTTPException
    p = Principal(id="u", roles=Role.USER)
    raised = False
    try:
        enforce_route_acl("GET", "/api/admin/users", p)
    except HTTPException as exc:
        raised = exc.status_code == 403
    assert raised


# ─── Env var secret filter ────────────────────────────────────────────────────
def test_env_filter_strips_secrets():
    """The /api/admin/system endpoint must NOT expose API keys / tokens."""
    r = prod_client.get(
        "/api/admin/system",
        headers={"Authorization": f"Bearer demo:{int(Role.ROOT)}:r-1"},
    )
    assert r.status_code == 200
    body = r.json()
    leaked = []
    for k in body["env"].keys():
        lk = k.lower()
        if any(t in lk for t in ("secret", "password", "token", "key", "auth", "credential")):
            leaked.append(k)
    assert not leaked, f"env vars leak secrets: {leaked}"
