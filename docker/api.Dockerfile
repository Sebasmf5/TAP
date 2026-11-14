# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/

RUN pnpm install --frozen-lockfile --filter @tap/api...

COPY packages/contracts/src ./packages/contracts/src
COPY apps/api/src ./apps/api/src
COPY apps/api/scripts ./apps/api/scripts
COPY apps/api/drizzle ./apps/api/drizzle

RUN pnpm --filter @tap/api run build && pnpm --filter @tap/api --prod deploy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
WORKDIR /app

RUN addgroup -S tap && adduser -S -G tap tap \
  && mkdir -p /var/lib/tap/storage \
  && chown -R tap:tap /app /var/lib/tap

COPY --from=build --chown=tap:tap /out/node_modules ./node_modules
COPY --from=build --chown=tap:tap /out/package.json ./package.json
COPY --from=build --chown=tap:tap /workspace/apps/api/dist ./dist
COPY --from=build --chown=tap:tap /workspace/apps/api/drizzle ./drizzle

USER tap
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD sh -c 'wget -qO- "http://127.0.0.1:${PORT:-${API_PORT:-3000}}/health" || exit 1'

CMD ["node", "dist/main.js"]
