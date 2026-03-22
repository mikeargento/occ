FROM node:lts-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

# ── Build CommandCentral dashboard ──
FROM base AS dashboard
WORKDIR /app/commandcentral
COPY packages/commandcentral/package.json packages/commandcentral/package-lock.json* ./
RUN npm install
COPY packages/commandcentral/ ./
ENV NODE_ENV=production
RUN npm run build

# ── Build hosted server ──
FROM base AS server
WORKDIR /app/hosted
COPY packages/hosted/package.json ./
RUN npm install
COPY packages/hosted/src ./src
COPY packages/hosted/tsconfig.json ./
RUN npx tsc

# ── Production ──
FROM base AS production
WORKDIR /app

# Copy server
COPY --from=server /app/hosted/dist ./dist
COPY --from=server /app/hosted/node_modules ./node_modules
COPY --from=server /app/hosted/package.json ./

# Copy dashboard static export
COPY --from=dashboard /app/commandcentral/out ./packages/commandcentral/out

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3100

EXPOSE 3100

CMD ["node", "dist/index.js"]
