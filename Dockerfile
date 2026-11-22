# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build-base
RUN npm install --global pnpm@11.25.0 \
    && install -d -o node -g node /app /site /mobile-web
USER node

FROM build-base AS build
WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY --chown=node:node . .
ENV CI=1 \
    VITE_API_BASE_URL=/api/v1 \
    VITE_DEMO_API=false
RUN pnpm test \
    && pnpm build \
    && test -s dist/index.html \
    && test -s dist/itsm/index.html \
    && test -s dist/sounds/alert-bell.wav \
    && cp -R dist/index.html dist/assets dist/fonts dist/sounds dist/mark.svg dist/itsm /site/

FROM build-base AS mobile-build
WORKDIR /mobile-web
COPY --chown=node:node mobile-web/package.json mobile-web/pnpm-lock.yaml mobile-web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false
COPY --chown=node:node mobile-web/ ./
ENV CI=1 \
    APP_BASE_PATH=/mobile/ \
    VITE_API_BASE_URL=/api/v1
RUN pnpm test \
    && pnpm build \
    && test -s dist/index.html \
    && test -s dist/service-worker.js \
    && test -s dist/manifest.webmanifest

FROM nginx/nginx-unprivileged:stable-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/ /srv/site/
COPY --from=mobile-build /mobile-web/dist/ /srv/site/mobile/

USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
