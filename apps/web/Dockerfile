# Builds and runs @hotel/web from within the full Rush monorepo.
#
# Single-stage build for the same reason as apps/api/Dockerfile: Rush/PNPM's symlinked
# node_modules layout is fragile to copy across build stages. See that file's comment,
# and consider "rush deploy" later if a smaller image is needed.
FROM node:22-slim

# The public API URL is baked into the client bundle at build time (Vite inlines
# import.meta.env.* statically), so it must be provided as a build arg, not a
# runtime environment variable.
ARG VITE_API_URL=http://localhost:3001/api
ENV VITE_API_URL=${VITE_API_URL}

WORKDIR /repo
COPY . .

RUN node common/scripts/install-run-rush.js install
RUN node common/scripts/install-run-rush.js build --to @hotel/web

WORKDIR /repo/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
