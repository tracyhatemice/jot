#!/bin/sh
# Named volumes start out root-owned. Hand their mount roots to `node`, then drop privileges.
set -e
for dir in /pnpm/store /cargo-target /usr/local/cargo/registry \
           /work/node_modules /work/packages/*/node_modules /work/apps/*/node_modules; do
  if [ -d "$dir" ] && [ "$(stat -c %u "$dir")" != "$(id -u node)" ]; then
    chown node:node "$dir"
  fi
done
exec gosu node "$@"
