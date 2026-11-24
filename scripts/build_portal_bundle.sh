#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.npm-global/bin:$PATH"

PORTAL_DIR="/mnt/d/OpenClaw/portal"
BUILD_DIR="$HOME/portal-fe-build"
STAGE="$HOME/portal-release-stage"
BUNDLE="/mnt/d/OpenClaw/portal-release.tar.gz"

echo "=== [1/2] Building Portal frontend in WSL2 (tsc + vite) ==="
mkdir -p "$BUILD_DIR"

NEED_INSTALL=0
if [ ! -d "$BUILD_DIR/node_modules" ]; then
  NEED_INSTALL=1
elif ! cmp -s "$PORTAL_DIR/frontend/package.json" "$BUILD_DIR/package.json"; then
  NEED_INSTALL=1
fi

cp "$PORTAL_DIR/frontend/package.json" "$BUILD_DIR/"
cp "$PORTAL_DIR/frontend/tsconfig.json" "$BUILD_DIR/"
cp "$PORTAL_DIR/frontend/vite.config.ts" "$BUILD_DIR/"
cp "$PORTAL_DIR/frontend/index.html" "$BUILD_DIR/"
rm -rf "$BUILD_DIR/src" "$BUILD_DIR/public"
cp -r "$PORTAL_DIR/frontend/src" "$BUILD_DIR/src"
cp -r "$PORTAL_DIR/frontend/public" "$BUILD_DIR/public"

cd "$BUILD_DIR"
if [ "$NEED_INSTALL" -eq 1 ]; then
  echo "Installing frontend dependencies..."
  pnpm install
fi

pnpm build

rm -rf "$PORTAL_DIR/frontend/dist"
cp -r "$BUILD_DIR/dist" "$PORTAL_DIR/frontend/dist"
systemctl --user restart couple-portal.service 2>/dev/null || true

echo "=== [2/2] Packing clean Portal release bundle (no data/secrets) ==="
rm -rf "$STAGE"
mkdir -p "$STAGE/frontend"
cp -r "$PORTAL_DIR/backend" "$STAGE/backend"
rm -rf "$STAGE/backend/data" "$STAGE/backend/__pycache__" "$STAGE/backend/app/__pycache__"
cp -r "$PORTAL_DIR/frontend/dist" "$STAGE/frontend/dist"
tar -czf "$BUNDLE" -C "$STAGE" .
ls -lh "$BUNDLE"
