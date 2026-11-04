# client/Dockerfile
# Build from monorepo root: docker build -f client/Dockerfile -t buramloop-client:latest .
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app

# Stage 1: Install workspace dependencies (cached layer)
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
RUN pnpm install --frozen-lockfile --filter @buramloop/client...

# Stage 2: Build @buramloop/shared and @buramloop/client (Vite SPA)
FROM deps AS build
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY tsconfig.base.json ./
COPY shared ./shared
COPY client ./client

RUN pnpm --filter @buramloop/shared build
RUN pnpm --filter @buramloop/client build

# Stage 3: Production Nginx Server
FROM nginx:1.27-alpine AS runner
LABEL org.opencontainers.image.title="BURAMLOOP Mission-Control UI"
LABEL org.opencontainers.image.description="Honey Operations Intelligence ERP Frontend (Hennigsdorf)"

# Remove default nginx config and copy custom SPA + /api/v1 proxy config
RUN rm -rf /etc/nginx/conf.d/default.conf
COPY client/nginx.conf /etc/nginx/conf.d/buramloop.conf

# Copy compiled Vite bundle from Stage 2
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]