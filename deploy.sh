#!/usr/bin/env bash
# Manual deploy: build the static export and push it to the live cPanel host.
#
# Deliberately not run from CI (see README.md "Build") — this script assumes
# an `stardustwebsite` entry already exists in the operator's ~/.ssh/config
# (host/port/user/key), so no credential of any kind lives in this repo.
set -euo pipefail

REMOTE_HOST="stardustwebsite"
# Relative to the remote $HOME (an SSH command session's default cwd) — never
# an absolute /home/<user>/... path, so the account username stays out of
# this public repo entirely.
REMOTE_DIR="stardust"
ARCHIVE_NAME="stardust-deploy-$(date +%Y%m%d%H%M%S).tar.gz"

cleanup() {
  rm -f "$ARCHIVE_NAME"
}
trap cleanup EXIT

echo "==> Building static export..."
npm ci
npm run build

if [ ! -d out ]; then
  echo "Error: out/ not found after build." >&2
  exit 1
fi

echo "==> Packaging out/ ..."
tar -czf "$ARCHIVE_NAME" -C out .

echo "==> Uploading to ${REMOTE_HOST}:~/${ARCHIVE_NAME} ..."
scp "$ARCHIVE_NAME" "${REMOTE_HOST}:${ARCHIVE_NAME}"

echo "==> Extracting on server ..."
# _next/ is wiped first: every file under it is content-hashed by Next, so a
# plain overwrite would leave every previous build's chunks behind forever.
# Everything else (cgi-bin, .well-known, .user.ini, php.ini — cPanel/account
# files, not site output) is left alone; the archive overwrites only the
# routes and assets the static export actually produces.
ssh "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
rm -rf "${REMOTE_DIR}/_next"
mkdir -p "${REMOTE_DIR}"
tar -xzf "${ARCHIVE_NAME}" -C "${REMOTE_DIR}"
rm -f "${ARCHIVE_NAME}"
EOF

echo "==> Deployed to https://stardust.konstelasi.co.id"
