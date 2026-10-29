# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.14.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/game/package.json packages/game/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
    && pnpm --filter @open-boards/server deploy --legacy --prod /runtime/apps/server

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY --from=build --chown=node:node /runtime/apps/server ./apps/server
COPY --from=build --chown=node:node /app/apps/client/dist ./apps/client/dist
USER node
EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]
