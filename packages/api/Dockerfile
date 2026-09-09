# Build context is the repo root (see docker-compose.yml), not this directory -
# npm workspaces means the root package.json/package-lock.json own the dependency
# graph, and `npm ci` validates the lockfile against every workspace's package.json,
# not just this one. Copying all three (api/web/e2e) before `npm ci` is the standard
# pattern for workspace-aware Docker builds; only api's actual source and compiled
# output ever make it into the runtime stage.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/e2e/package.json packages/e2e/package.json
RUN npm ci
COPY packages/api ./packages/api
RUN npm run build -w packages/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/e2e/package.json packages/e2e/package.json
RUN npm ci --omit=dev
COPY --from=build /app/packages/api/dist ./packages/api/dist
EXPOSE 4000
CMD ["node", "packages/api/dist/server.js"]
