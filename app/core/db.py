"""SQLite + FTS5 database layer.

A single SQLite file holds every persistent state for the MarketingForge app:
users, workspaces, onboarding notes, credit ledger, campaigns, generated
frames, generated video URLs, and Gmail SMTP vault credentials. We use
the stdlib ``sqlite3`` (no ORM) so the dependency surface stays minimal.

Five FTS5 virtual tables back the workspace RAG: every onboarding chunk
and every completed-campaign artifact is indexed so the client SDK can
query it with ``MATCH`` for context-aware ad generation.
"""
from __future__ import annotations
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------
_DEFAULT_PATH = Path(os.getenv("DB_PATH", "data/marketingforge.db"))


class Database:
    """Thread-safe SQLite connection factory.

    SQLite has a single-writer model; we serialize writes with a lock and
    allow concurrent reads. Foreign keys are enforced so cascade deletes
    work as intended. ``row_factory`` is set to ``sqlite3.Row`` so query
    results behave like dicts.
    """

    def __init__(self, path: os.PathLike[str] | str | None = None) -> None:
        self._path = Path(path) if path else _DEFAULT_PATH
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.Lock()
        self._init_schema()

    # ---- connection lifecycle ------------------------------------------------
    def _connect(self) -> sqlite3.Connection:
        # isolation_level=None = autocommit mode, but we use explicit
        # BEGIN/COMMIT in write() so multi-statement transactions
        # are atomic.
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def write(self) -> Iterator[sqlite3.Connection]:
        """Acquire the write lock and return a connection inside a transaction.

        We deliberately keep isolation_level at its default (deferred)
        so sqlite3 manages BEGIN/COMMIT for us and we can use the
        with conn: block — much simpler and less error-prone than
        manual transaction control.
        """
        with self._write_lock:
            conn = self._connect()
            try:
                with conn:  # auto-commit on success, auto-rollback on exception
                    yield conn
            finally:
                conn.close()

    # ---- schema -------------------------------------------------------------
    def _init_schema(self) -> None:
        """Create every table, index, and FTS5 virtual table on first boot.

        Idempotent — uses ``CREATE TABLE IF NOT EXISTS`` so a re-run on an
        existing database is safe. We keep the schema flat and explicit
        rather than using migrations: this codebase is single-process and
        schema changes are part of code review.
        """
        with self.write() as conn:
            conn.executescript(_SCHEMA)
            _migrate_users_otp_columns(conn)
            _migrate_users_reset_columns(conn)


# ---------------------------------------------------------------------------
# Migrations (obs: db.migrate.users_otp, coord: auth.otp.migration)
# ---------------------------------------------------------------------------
# Columns the OTP confirmation flow needs. ``confirm_token`` is kept only so
# databases created before the OTP switch keep working; new installs never
# write to it.
_OTP_COLUMNS: tuple[tuple[str, str], ...] = (
    ("confirm_token", "TEXT"),
    ("confirm_otp", "TEXT"),
    ("confirm_otp_expires", "REAL"),
    ("last_otp_resend_at", "REAL"),
)


def _migrate_users_otp_columns(conn: sqlite3.Connection) -> None:
    """One-shot, idempotent ALTER block for the users table.

    ``CREATE TABLE IF NOT EXISTS`` never alters an existing table, so a
    pre-OTP database would be missing the new columns. Legacy
    ``confirm_token`` values are copied into ``confirm_otp`` (best effort)
    so registrations made before the switch can still be confirmed.
    """
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).fetchone() is None:
        return
    existing = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    for name, ddl in _OTP_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
    if "confirm_token" in existing:
        # Best-effort legacy path: a pre-OTP registration keeps a usable code
        # (15 more minutes) instead of a dead link.
        conn.execute(
            "UPDATE users SET confirm_otp = confirm_token, "
            "confirm_otp_expires = CAST(strftime('%s', 'now') AS INTEGER) + 900 "
            "WHERE confirm_token IS NOT NULL AND confirm_otp IS NULL"
        )


# ---------------------------------------------------------------------------
# Password-reset columns (obs: db.migrate.users_reset, coord: auth.reset.migration)
# ---------------------------------------------------------------------------
_RESET_COLUMNS: tuple[tuple[str, str], ...] = (
    ("reset_token", "TEXT"),
    ("reset_expires", "REAL"),
    ("last_password_reset_at", "REAL"),
)


def _migrate_users_reset_columns(conn: sqlite3.Connection) -> None:
    """One-shot, idempotent ALTER block for the password-reset columns.

    Same shape as :func:`_migrate_users_otp_columns`: a pre-reset database
    gets the three nullable columns bolted on, nothing else changes.
    """
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).fetchone() is None:
        return
    existing = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    for name, ddl in _RESET_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")


# ---------------------------------------------------------------------------
# Schema (one big SQL string for readability)
# ---------------------------------------------------------------------------
_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    email_confirmed INTEGER NOT NULL DEFAULT 0,
    confirm_otp         TEXT,   -- 6-digit code, NULL once consumed
    confirm_otp_expires REAL,   -- unix ts, NULL once consumed
    last_otp_resend_at  REAL,   -- unix ts, resend rate-limit (obs: auth.otp.resend)
    reset_token             TEXT,   -- 32-byte url-safe token, NULL once consumed
    reset_expires           REAL,   -- unix ts, NULL once consumed
    last_password_reset_at  REAL,   -- unix ts, resend rate-limit (obs: auth.reset.resend)
    roles         INTEGER NOT NULL DEFAULT 2,    -- USER bit
    created_at    REAL NOT NULL,
    last_seen     REAL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    section      TEXT NOT NULL,                -- e.g. 'brand', 'audience', 'tone'
    content      TEXT NOT NULL,
    created_at   REAL NOT NULL
);

-- FTS5 mirror for fast semantic-ish lookup. We index every onboarding chunk
-- and (later) every generated ad artifact so the client SDK can do a
-- MATCH query per new campaign for RAG-style context.
CREATE VIRTUAL TABLE IF NOT EXISTS workspace_kb USING fts5(
    workspace_id UNINDEXED,
    kind,        -- 'onboarding' | 'frame' | 'video' | 'campaign'
    source_id UNINDEXED,
    title,
    body,
    tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    delta        REAL NOT NULL,    -- positive = purchase, negative = spend
    reason       TEXT NOT NULL,    -- 'topup' | 'spend:<campaign_id>' | 'refund'
    balance_after REAL NOT NULL,
    created_at   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS email_vault (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    -- ciphertext (Fernet token, base64) of the Google App Password.
    app_password_ct TEXT NOT NULL,
    app_password_nonce TEXT NOT NULL,
    updated_at   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_kind   TEXT NOT NULL,
    target        TEXT NOT NULL,
    duration_s    INTEGER NOT NULL,
    style         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
    plan_json     TEXT,                  -- campaign plan, frames, script, video URLs
    total_cost_usd REAL NOT NULL DEFAULT 0,
    credits_spent REAL NOT NULL DEFAULT 0,
    created_at    REAL NOT NULL,
    finished_at   REAL
);

CREATE TABLE IF NOT EXISTS campaign_assets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,           -- 'frame' | 'video' | 'screenshot' | 'stitched'
    url          TEXT NOT NULL,
    duration_s   INTEGER,
    metadata_json TEXT,
    created_at   REAL NOT NULL
);

-- Which subscription plan a workspace has chosen. One row per workspace;
-- re-checking out simply overwrites it (see app/api/billing.py checkout).
CREATE TABLE IF NOT EXISTS workspace_plan (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    plan_name    TEXT NOT NULL,
    since        REAL NOT NULL
);

-- Append-only SSE log: one row per event the pipeline emitted, in order.
-- The events endpoint replays it on (re)connect so a dropped socket never
-- loses a step.  # coordination id: pipeline.event_log
CREATE TABLE IF NOT EXISTS campaign_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL,
    event       TEXT NOT NULL,
    data_json   TEXT,
    created_at  REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_campaign ON campaign_assets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_events_campaign ON campaign_events(campaign_id, seq);
CREATE INDEX IF NOT EXISTS idx_ledger_ws       ON credit_ledger(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_ws    ON campaigns(workspace_id);
"""


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------
_DB: Database | None = None
_DB_LOCK = threading.Lock()


def get_db() -> Database:
    """Lazy singleton used everywhere in the app."""
    global _DB
    if _DB is None:
        with _DB_LOCK:
            if _DB is None:
                _DB = Database()
    return _DB


def reset_db_for_tests(path: str) -> Database:
    """Drop and recreate the DB at ``path``. Only used in the test suite."""
    global _DB
    with _DB_LOCK:
        if Path(path).exists():
            Path(path).unlink()
        _DB = Database(path=path)
    return _DB
