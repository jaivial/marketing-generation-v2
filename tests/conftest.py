"""Shared test setup (obs: tests.conftest.auth_bypass, coord: tests.auth.env).

The legacy demo-token fixtures scattered across this suite
(``Bearer demo:<roles>:<id>`` and the ``X-Demo-Principal`` header) are only
honoured by the middleware when ``MSWEA_DEV_AUTH_BYPASS=1`` -- production
defaults to real JWTs. Opt the whole suite in once, here, instead of touching
every fixture. Individual tests that exercise the *default* (JWT-only) path
simply delete the variable with ``monkeypatch.delenv``.
"""
import os

# coord: tests.auth.bypass_env -- idempotent, never overrides an explicit value.
os.environ.setdefault("MSWEA_DEV_AUTH_BYPASS", "1")
