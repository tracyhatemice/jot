#!/usr/bin/env sh
# Prepares the checkout for Docker: pre-creates node_modules mount points as the host user
# (Docker would otherwise create them owned by root) and seeds .env.
set -eu
cd "$(dirname "$0")/.."
for d in node_modules packages/core/node_modules packages/db/node_modules \
         packages/driver-web/node_modules apps/client/node_modules apps/desktop/node_modules; do
  mkdir -p "$d"
done
[ -f .env ] || cp .env.example .env
