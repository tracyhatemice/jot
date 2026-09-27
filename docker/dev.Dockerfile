# syntax=docker/dockerfile:1
# Jot development image: Node 24 + pnpm + Rust + Tauri's Linux build dependencies.
FROM node:24-trixie

ARG UID=1000
ARG GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
      libayatana-appindicator3-dev librsvg2-dev \
      fonts-noto-cjk fonts-noto-color-emoji sqlite3 gosu dbus x11-apps \
 && rm -rf /var/lib/apt/lists/*

# Give the image's `node` user the host UID/GID so files written into the bind mount stay host-owned.
RUN groupmod -o -g "$GID" node && usermod -o -u "$UID" -g "$GID" node

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    CARGO_TARGET_DIR=/cargo-target \
    PATH=/usr/local/cargo/bin:$PATH \
    npm_config_store_dir=/pnpm/store \
    IN_JOT_CONTAINER=1

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --profile minimal --default-toolchain stable --no-modify-path \
 && rustup component add rustfmt clippy \
 && npm install -g pnpm@10 \
 && mkdir -p /pnpm/store /cargo-target \
 && chown -R node:node /pnpm /cargo-target "$CARGO_HOME" "$RUSTUP_HOME"

COPY docker/entrypoint.sh /usr/local/bin/jot-entrypoint
RUN chmod +x /usr/local/bin/jot-entrypoint
WORKDIR /work
ENTRYPOINT ["jot-entrypoint"]
CMD ["bash"]
