#!/usr/bin/env bash
set -euo pipefail

# Two-tier safe backup for Couple Space (Portal + I-land + OpenClaw):
#   1. Daily core snapshot (core-*.tar.gz, retain 14):
#      WAL-safe SQLite backups + integrity_check + secrets + openclaw.json + workspaces (no .venv) + workbench text data
#   2. Weekly vault/media archive (vault-*.tar.gz, Sundays or --with-vault, retain 2):
#      Portal vault uploads + I-land uploads

BACKUP_DIR="/var/backups/couple-space"
STAMP="$(date +%Y%m%d-%H%M)"
DAY_STAMP="$(date +%Y%m%d)"
DOW="$(date +%u)" # 7 = Sunday
WITH_VAULT=0
if [ "${1:-}" = "--with-vault" ]; then
  WITH_VAULT=1
fi

mkdir -p "$BACKUP_DIR"
STAGE="$(mktemp -d /tmp/couple-backup.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/db" "$STAGE/workbench-meta"

# 1. Online WAL-safe SQLite snapshot + PRAGMA integrity_check (stdlib sqlite3)
python3 - "$STAGE/db" <<'PY'
import glob, os, pathlib, sqlite3, sys

out_dir = pathlib.Path(sys.argv[1])
targets = [
    ("/var/lib/couple-space/portal/portal.db", "portal.db"),
    ("/var/lib/couple-space/iland/iland.db", "iland.db"),
]
for lpath in sorted(glob.glob("/var/lib/couple-space/portal/vault/*/workbench/ledger.db")):
    parts = pathlib.Path(lpath).parts
    uid = parts[-3] if len(parts) >= 3 else "unknown"
    targets.append((lpath, f"ledger-{uid}.db"))

for src_str, dest_name in targets:
    src_path = pathlib.Path(src_str)
    if not src_path.is_file():
        continue
    dst_path = out_dir / dest_name
    with sqlite3.connect(f"file:{src_path}?mode=ro", uri=True, timeout=15) as src_conn:
        with sqlite3.connect(str(dst_path)) as dst_conn:
            src_conn.backup(dst_conn)
    with sqlite3.connect(str(dst_path)) as chk_conn:
        res = chk_conn.execute("PRAGMA integrity_check").fetchone()
        if not res or res[0] != "ok":
            raise RuntimeError(f"SQLite integrity_check failed for {dest_name}: {res}")
    os.chmod(dst_path, 0o600)
    print(f"[backup] sqlite ok: {dest_name} ({dst_path.stat().st_size} bytes)")
PY

# 2. Collect lightweight workbench structured files (JSON/CSV/MD), preserving subpaths (e.g. apps/<id>/)
for wb_dir in /var/lib/couple-space/portal/vault/*/workbench; do
  [ -d "$wb_dir" ] || continue
  uid="$(basename "$(dirname "$wb_dir")")"
  mkdir -p "$STAGE/workbench-meta/$uid"
  (
    cd "$wb_dir"
    find . -maxdepth 3 -type f \( -name '*.json' -o -name '*.csv' -o -name '*.md' \) \
      -exec cp --parents -a {} "$STAGE/workbench-meta/$uid/" \;
  )
done

# 3. Copy Portal signing secret & OpenClaw config
[ -f /var/lib/couple-space/portal/.secret ] && cp -a /var/lib/couple-space/portal/.secret "$STAGE/portal.secret"
[ -f /home/donut/.openclaw/openclaw.json ] && cp -a /home/donut/.openclaw/openclaw.json "$STAGE/openclaw.json"

# 4. Pack daily core snapshot (workspaces exclude .venv / .git / __pycache__ / vault symlink)
CORE_DEST="$BACKUP_DIR/core-${STAMP}.tar.gz"
tar -czf "$CORE_DEST" \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*.pyc' \
  -C "$STAGE" . \
  -C /home/donut/.openclaw workspace workspace-her 2>/dev/null || \
tar -czf "$CORE_DEST" \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*.pyc' \
  -C "$STAGE" . \
  -C /home/donut/.openclaw workspace

chmod 600 "$CORE_DEST"
echo "[backup] core archive ready: $CORE_DEST ($(du -h "$CORE_DEST" | awk '{print $1}'))"

# Retain 14 daily core archives
ls -t "$BACKUP_DIR"/core-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

# 5. Weekly media/vault archive (Sundays or explicit --with-vault; retain 2)
if [ "$DOW" = "7" ] || [ "$WITH_VAULT" -eq 1 ]; then
  VAULT_DEST="$BACKUP_DIR/vault-${DAY_STAMP}.tar.gz"
  tar -czf "$VAULT_DEST" \
    --exclude='*.db-wal' \
    --exclude='*.db-shm' \
    /var/lib/couple-space/portal/vault \
    /var/lib/couple-space/iland/uploads 2>/dev/null || true
  chmod 600 "$VAULT_DEST"
  echo "[backup] vault archive ready: $VAULT_DEST ($(du -h "$VAULT_DEST" | awk '{print $1}'))"
  ls -t "$BACKUP_DIR"/vault-*.tar.gz 2>/dev/null | tail -n +3 | xargs -r rm -f
fi
