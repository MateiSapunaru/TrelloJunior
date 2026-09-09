# Build context is the repo root (see docker-compose.yml) - same reasoning as
# packages/api/Dockerfile: npm workspaces needs every package.json present for
# `npm ci` to validate against the lockfile.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/e2e/package.json packages/e2e/package.json
RUN npm ci
COPY packages/web ./packages/web
# Vite inlines env vars into the built JS bundle at build time, not runtime - so
# this has to be a build ARG, and it has to be the URL the *browser* (running on
# the host, not inside the Docker network) can reach the API at, not the internal
# Docker service hostname (e.g. http://api:4000 would resolve for other
# containers but not for the browser tab loading this page).
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w packages/web

FROM nginx:alpine AS runtime
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
