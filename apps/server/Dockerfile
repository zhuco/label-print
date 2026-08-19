FROM node:24-alpine AS runtime

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api-contract ./packages/api-contract
COPY packages/template-schema ./packages/template-schema
COPY apps/server ./apps/server

# The server runs TypeScript through the production tsx dependency. Workspace filters keep the
# image limited to the API and its runtime dependencies.
RUN pnpm install --frozen-lockfile --prod --filter @label/server...

ENV NODE_ENV=production
EXPOSE 8787

CMD ["pnpm", "--filter", "@label/server", "start"]
