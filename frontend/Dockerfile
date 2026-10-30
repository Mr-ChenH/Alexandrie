# syntax=docker/dockerfile:1

FROM oven/bun:1.4.4 AS bun

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# Keep dependencies cached while application source changes.
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

COPY . .
ENV NODE_ENV=production
RUN bun run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8200

COPY --from=builder --chown=node:node /app/.output ./.output
COPY --chown=node:node docker-runtime-config.mjs ./docker-runtime-config.mjs
COPY --chown=node:node --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

USER node
EXPOSE 8200
ENTRYPOINT ["/app/docker-entrypoint.sh"]
