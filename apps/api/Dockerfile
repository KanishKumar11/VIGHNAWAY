# VIGHNAWAY API image. Build context is the repository root:
#   docker compose -f infra/docker-compose.yml build api
# (or: docker build -f apps/api/Dockerfile .)
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
# Workspace manifests first, for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/engine/package.json packages/engine/
COPY packages/scenario-data/package.json packages/scenario-data/
COPY packages/tokens/package.json packages/tokens/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "api..."
COPY packages ./packages
COPY apps/api ./apps/api
# Workspace packages ship ESM+CJS builds; the API's compiled CommonJS uses the CJS ones.
RUN pnpm --filter "api^..." run build && pnpm --filter api run build

FROM build AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /repo/apps/api
EXPOSE 4000
USER node
# The first start stores the ~23,000-edge road graph before the API listens, so give it a generous window.
HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=15 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations and the seed are idempotent, so every start brings the database up to date.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && node dist/main.js"]
