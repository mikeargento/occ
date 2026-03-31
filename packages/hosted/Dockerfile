FROM node:lts-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app

# Copy root occproof package (transitive dependency of @occ/ledger)
COPY package.json /occproof/package.json
COPY dist /occproof/dist
COPY src /occproof/src

# Copy ledger package
COPY packages/ledger /app/packages/ledger

# Copy hosted package and install deps
COPY packages/hosted/package.json packages/hosted/package-lock.json* ./
RUN npm install
COPY packages/hosted/src ./src
COPY packages/hosted/tsconfig.json ./
RUN npx tsc

FROM base AS production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /occproof /occproof
COPY --from=build /app/package.json ./
COPY packages/hosted/dashboard ./dashboard
COPY packages/hosted/hooks ./hooks

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3100

EXPOSE 3100

CMD ["node", "dist/index.js"]
