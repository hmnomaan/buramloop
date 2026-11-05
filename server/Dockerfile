# server/Dockerfile

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app

# Install workspace dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN pnpm install --frozen-lockfile

# Build shared package and API
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY server/ ./server/

RUN pnpm --filter @buramloop/shared build
RUN pnpm --filter @buramloop/server build

# Production runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=base /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/corepack
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/shared/node_modules ./shared/node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist

USER node
EXPOSE 4000
CMD ["node", "server/dist/server/src/server.js"]
