"""Admin routes — full system management (root only).

These are the routes that a `root` user needs to manage the entire
application: user management, system info, and access to the log
stream. All endpoints require `Role.ROOT`.
"""
from __future__ import annotations
import logging
import os
import platform
import sys
import time
from collections import deque
from typing import Deque, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.acl import (
    Perm,
    Principal,
    Role,
    ROLE_LIST,
    PERMISSION_LIST,
    require_root,
)


# Routes are mounted at /api/admin/* by main.py (no prefix here).
router = APIRouter(tags=["admin"])
log = logging.getLogger("marketing.admin")


# ─── A small ring-buffer of in-memory log records ─────────────────────
# In production this would tail an actual log file or push into a log
# aggregation system (Loki, ELK, etc.). The buffer is plenty for the
# "Admin / System Logs" page in this demo.
_LOG_BUFFER: Deque[dict] = deque(maxlen=2000)
_started_at = time.time()


class LogRecord(BaseModel):
    ts: float
    level: str
    name: str
    message: str


class SystemInfo(BaseModel):
    hostname: str
    python: str
    platform: str
    uptime_s: float
    cwd: str
    env: dict


# ─── Roles & permissions (exported to the frontend) ──────────────────
@router.get("/roles", response_model=List[dict])
def list_roles(_: Principal = Depends(require_root())):
    return ROLE_LIST


@router.get("/permissions", response_model=List[dict])
def list_permissions(_: Principal = Depends(require_root())):
    return PERMISSION_LIST


# ─── User management ────────────────────────────────────────────────
# In production this hits a database. For the demo we use an in-memory
# store seeded with a few users so the UI can render.
class UserRecord(BaseModel):
    id: str
    email: str
    name: str
    roles: int            # bitmask
    roles_names: List[str] = []
    tenant_id: str = "t-001"
    created_at: float = 0.0
    last_seen: float | None = None


_USERS: dict[str, UserRecord] = {}


def _seed_users() -> None:
    if _USERS:
        return
    base_ts = time.time() - 86400 * 30
    seed = [
        UserRecord(id="u-001", email="alice@example.com",   name="Alice Anderson",
                   roles=int(Role.GUEST | Role.USER), roles_names=["user"],
                   tenant_id="t-001", created_at=base_ts + 86400 * 5),
        UserRecord(id="u-002", email="bob@example.com",     name="Bob Brown",
                   roles=int(Role.GUEST | Role.USER | Role.VIEWER), roles_names=["user", "viewer"],
                   tenant_id="t-001", created_at=base_ts + 86400 * 3),
        UserRecord(id="u-003", email="carol@example.com",   name="Carol Chen",
                   roles=int(Role.GUEST | Role.USER | Role.BILLING), roles_names=["user", "billing"],
                   tenant_id="t-001", created_at=base_ts + 86400 * 10),
        UserRecord(id="a-001", email="admin@example.com",   name="Adam Admin",
                   roles=int(Role.GUEST | Role.USER | Role.ADMIN), roles_names=["admin"],
                   tenant_id="t-001", created_at=base_ts + 86400 * 20),
        UserRecord(id="r-001", email="root@example.com",    name="Rita Root",
                   roles=int(Role.GUEST | Role.USER | Role.ADMIN | Role.ROOT),
                   roles_names=["root"],
                   tenant_id="t-001", created_at=base_ts + 86400 * 25),
    ]
    for u in seed:
        _USERS[u.id] = u


def _role_names(roles_int: int) -> List[str]:
    r = Role(roles_int)
    out = []
    for n in ROLE_LIST:
        if int(getattr(Role, n["name"])) & r:
            out.append(n["name"])
    return out


@router.get("/users", response_model=List[UserRecord])
def list_users(_: Principal = Depends(require_root())):
    _seed_users()
    out = []
    for u in _USERS.values():
        ur = u.model_copy()
        ur.roles_names = _role_names(ur.roles)
        out.append(ur)
    out.sort(key=lambda x: x.created_at, reverse=True)
    return out


@router.get("/users/{user_id}", response_model=UserRecord)
def get_user(user_id: str, _: Principal = Depends(require_root())):
    _seed_users()
    if user_id not in _USERS:
        raise HTTPException(status_code=404, detail="user not found")
    u = _USERS[user_id].model_copy()
    u.roles_names = _role_names(u.roles)
    return u


class UserUpsert(BaseModel):
    email: str
    name: str
    roles: int
    tenant_id: str = "t-001"


@router.post("/users", response_model=UserRecord, status_code=201)
def create_user(payload: UserUpsert, _: Principal = Depends(require_root())):
    _seed_users()
    new_id = f"u-{len(_USERS) + 1:03d}"
    u = UserRecord(
        id=new_id,
        email=payload.email,
        name=payload.name,
        roles=payload.roles,
        roles_names=_role_names(payload.roles),
        tenant_id=payload.tenant_id,
        created_at=time.time(),
    )
    _USERS[new_id] = u
    log.info("admin: created user id=%s roles=%d", new_id, payload.roles)
    return u


@router.put("/users/{user_id}", response_model=UserRecord)
def update_user(user_id: str, payload: UserUpsert, _: Principal = Depends(require_root())):
    _seed_users()
    if user_id not in _USERS:
        raise HTTPException(status_code=404, detail="user not found")
    u = _USERS[user_id]
    u.email = payload.email
    u.name = payload.name
    u.roles = payload.roles
    u.roles_names = _role_names(payload.roles)
    u.tenant_id = payload.tenant_id
    log.info("admin: updated user id=%s roles=%d", user_id, payload.roles)
    return u.model_copy()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, _: Principal = Depends(require_root())):
    _seed_users()
    if user_id not in _USERS:
        raise HTTPException(status_code=404, detail="user not found")
    if user_id == "r-001":
        # Safety net: don't allow deleting the only root
        raise HTTPException(status_code=400, detail="cannot delete the built-in root user")
    del _USERS[user_id]
    log.info("admin: deleted user id=%s", user_id)
    return None


# ─── System info ─────────────────────────────────────────────────────
@router.get("/system", response_model=SystemInfo)
def get_system_info(_: Principal = Depends(require_root())):
    return SystemInfo(
        hostname=platform.node(),
        python=sys.version.split()[0],
        platform=platform.platform(),
        uptime_s=round(time.time() - _started_at, 1),
        cwd=os.getcwd(),
        env={k: v for k, v in sorted(os.environ.items())
              if not any(t in k.lower() for t in ("secret", "password", "token", "key", "auth", "credential"))
              and len(v) < 200},
    )


# ─── Log stream ──────────────────────────────────────────────────────
# Capture logs into a ring buffer via a custom handler.

class _CaptureHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:  # type: ignore[override]
        try:
            _LOG_BUFFER.appendleft({
                "ts": record.created,
                "level": record.levelname,
                "name": record.name,
                "message": self.format(record)[:2000],
            })
        except Exception:
            pass


_handler: _CaptureHandler | None = None


def install_log_capture() -> None:
    global _handler
    if _handler is not None:
        return
    h = _CaptureHandler()
    h.setLevel(logging.INFO)
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s — %(message)s"))
    root = logging.getLogger()
    root.addHandler(h)
    _handler = h


install_log_capture()


@router.get("/logs", response_model=List[LogRecord])
def get_logs(
    level: str | None = None,
    q: str | None = None,
    limit: int = 200,
    _: Principal = Depends(require_root()),
):
    items = list(_LOG_BUFFER)
    if level:
        items = [x for x in items if x["level"] == level.upper()]
    if q:
        ql = q.lower()
        items = [x for x in items if ql in x["message"].lower() or ql in x["name"].lower()]
    return [LogRecord(**x) for x in items[: max(1, min(1000, limit))]]


@router.post("/logs/test")
def emit_test_log(_: Principal = Depends(require_root())):
    log.warning("admin: test log emitted at %s", time.time())
    return {"ok": True}


# ─── Route → permission registry (frontend mirror) ─────────────────────────────
# The frontend fetches this once at boot and uses it to render a route → perm
# map. Keeping the data exported server-side means the SPA never has to
# hardcode HTTP paths.
from app.core.acl import ROUTE_PERMISSIONS as _ROUTE_PERMISSIONS


@router.get("/routes", response_model=List[dict])
def list_routes(_: Principal = Depends(require_root())):
    return _ROUTE_PERMISSIONS


@router.get("/acl/matrix", response_model=dict)
def acl_matrix(_: Principal = Depends(require_root())):
    """Return the full ACL matrix (roles × permissions × routes).

    Useful for root users debugging access control, or the frontend
    "permission viewer" page that visualises who-can-do-what.
    """
    return {
        "roles": ROLE_LIST,
        "permissions": PERMISSION_LIST,
        "routes": _ROUTE_PERMISSIONS,
    }


# ─── Credits (root only) ───────────────────────────────────────────────────
# Mounted here rather than in main.py so the whole admin surface stays behind
# a single `/api/admin` prefix.
from app.api.admin_credits import router as _credits_router  # noqa: E402

router.include_router(_credits_router)
