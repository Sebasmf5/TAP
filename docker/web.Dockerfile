# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/

RUN pnpm install --frozen-lockfile --filter @tap/web...

COPY packages/contracts/src ./packages/contracts/src
COPY apps/web/src ./apps/web/src

# Solo variables públicas VITE_* permitidas por diseño (sin secretos en capas ni ARG).
ENV VITE_API_BASE_URL=/api/v1
ENV VITE_APP_NAME=Tap

RUN pnpm --filter @tap/web run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1
