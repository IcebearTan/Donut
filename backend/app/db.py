from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from typing import Iterator

from .config import DB_PATH


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


@contextmanager
def db_session() -> Iterator[sqlite3.Connection]:
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with db_session() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL UNIQUE,
                pass_hash TEXT NOT NULL,
                avatar_emoji TEXT NOT NULL DEFAULT '🐻',
                assistant_name TEXT NOT NULL DEFAULT 'Donut',
                assistant_emoji TEXT NOT NULL DEFAULT '🍩',
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                slug TEXT NOT NULL,
                name TEXT NOT NULL,
                emoji TEXT NOT NULL DEFAULT '📁',
                summary TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, slug),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_projects_user_updated
                ON projects(user_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                space_type TEXT NOT NULL DEFAULT 'personal',
                title TEXT NOT NULL DEFAULT '新对话',
                project_id TEXT DEFAULT NULL,
                is_main INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
                ON chat_sessions(user_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                thinking TEXT NOT NULL DEFAULT '',
                tools_json TEXT NOT NULL DEFAULT '[]',
                images_json TEXT NOT NULL DEFAULT '[]',
                usage_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
                ON chat_messages(session_id, created_at ASC);
            """
        )
        # Idempotent schema migrations for existing SQLite databases
        user_cols = {
            r["name"]
            for r in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        if "assistant_emoji" not in user_cols:
            conn.execute(
                "ALTER TABLE users ADD COLUMN assistant_emoji TEXT NOT NULL DEFAULT '🍩'"
            )

        sess_cols = {
            r["name"]
            for r in conn.execute("PRAGMA table_info(chat_sessions)").fetchall()
        }
        if "project_id" not in sess_cols:
            conn.execute(
                "ALTER TABLE chat_sessions ADD COLUMN project_id TEXT DEFAULT NULL"
            )
        if "is_main" not in sess_cols:
            conn.execute(
                "ALTER TABLE chat_sessions ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0"
            )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_project
                ON chat_sessions(user_id, project_id, updated_at DESC)
            """
        )


def now_ms() -> int:
    return int(time.time() * 1000)
