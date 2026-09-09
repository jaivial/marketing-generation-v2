"""FastAPI entrypoint. Serves the SPA shell + static assets.

The frontend is built with Vite (React + TypeScript + Tailwind). The production
build is placed in `static/dist/`. We also copy `index.html` to `static/`
so the catch-all mount serves it.

Global ACL
==========
Every request flows through ``ACLMiddleware`` which:

1. Resolves a ``Principal`` from the ``Authorization`` header (or the
   ``X-Demo-Principal`` debug override) and stashes it on
   ``request.state.principal``.
2. Looks the request's method+path up in ``ROUTE_PERMISSIONS`` and 403s
   the request immediately if the principal lacks the required permission.

This is the *single* place where HTTP-level authorization is enforced.
Route handlers can still declare ``Depends(require_root())`` etc. as a
defence-in-depth, but the middleware is the primary gate.
"""
import logging
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, status

# Configure root logger so app-level log.info / log.warning actually surface
# in `docker logs`. Uvicorn installs its own handlers but does not propagate
# ours; this hook restores the standard stream handler at INFO level.
_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
    force=True,
)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api.routes import router as public_router
from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.admin_vault import router as admin_vault_router
from app.api.translations import router as i18n_router
from app.api.billing_stripe import router as billing_stripe_router
from app.api.onboarding import router as onboarding_router
from app.core.acl import (
    Principal,
    Role,
    ROUTE_PERMISSIONS,

    PERMISSION_LIST,
    _parse_demo_token,
    enforce_route_acl,
)


BASE_DIR = Path(__file__).parent.parent
STATIC_DIR = BASE_DIR / "static"
DIST_DIR = STATIC_DIR / "dist"

app = FastAPI(title="MarketingForge", version="0.5.0")

# ─── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
    expose_headers=["*"],
)


# ─── Global ACL middleware ─────────────────────────────────────────────────────
def _resolve_principal(request: Request) -> Principal:
    """Build a Principal from the Authorization header or X-Demo-Principal."""
    creds = request.headers.get("authorization", "")
    if creds.startswith("Bearer "):
        token = creds[len("Bearer "):]
        principal = _parse_demo_token("Bearer " + token) or _parse_demo_token(creds)
        if principal is not None:
            return principal
    override = request.headers.get("X-Demo-Principal")
    if override:
        try:
            flags, rest = override.split(":", 1)
            id_, _, email = rest.partition(":")
            return Principal(id=id_, email=email, roles=Role(int(flags)))
        except ValueError:
            pass
    return Principal(id="guest", email="", roles=Role.GUEST)


class ACLMiddleware(BaseHTTPMiddleware):
    """Global ACL enforcement.

    Every request goes through this middleware. We:

    * Resolve a Principal from headers.
    * Look the (method, path) up in the route → permission registry.
    * 403 immediately if the principal lacks the required permission.

    Anything that *isn't* an ``/api/`` route is exempt — the SPA shell, the
    static asset mounts and the catch-all are deliberately accessible so the
    React router can take over.
    """

    async def dispatch(self, request: Request, call_next):
        # Skip ACL for non-API paths (SPA shell, static assets).
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        principal = _resolve_principal(request)
        request.state.principal = principal

        try:
            enforce_route_acl(request.method, request.url.path, principal)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail, "principal": {
                    "id": principal.id,
                    "roles": int(principal.roles),
                    "is_root": principal.is_root,
                    "is_admin": principal.is_admin,
                }},
            )
        return await call_next(request)


app.add_middleware(ACLMiddleware)


# ─── API routers ───────────────────────────────────────────────────────────────
app.include_router(public_router, prefix="/api")
app.include_router(admin_router, prefix="/api/admin")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_vault_router, prefix="/api/admin")
app.include_router(onboarding_router, prefix="/api")
app.include_router(i18n_router)
app.include_router(billing_stripe_router, prefix="/api")


# ─── Static + SPA fallback ─────────────────────────────────────────────────────
def serve_spa() -> HTMLResponse | FileResponse:
    """Serve the React SPA's index.html."""
    if not DIST_DIR.exists():
        return HTMLResponse(
            "<h1>Frontend not built</h1>"
            "<p>Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code> first.</p>",
            status_code=500,
        )
    index_file = DIST_DIR / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>Missing index.html</h1>", status_code=500)
    return FileResponse(index_file)


if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ─── SEO endpoints (must be declared BEFORE the SPA catch-all) ───────────────
@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    """Serve the real robots.txt, not the SPA shell."""
    return FileResponse(
        STATIC_DIR / "robots.txt",
        media_type="text/plain",
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    """Serve the real sitemap.xml, not the SPA shell."""
    return FileResponse(
        STATIC_DIR / "sitemap.xml",
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("assets/") or full_path.startswith("static/"):
        return HTMLResponse("Not found", status_code=404)
    return serve_spa()


@app.get("/", include_in_schema=False)
async def root_index():
    return serve_spa()
