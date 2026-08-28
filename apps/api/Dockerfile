# Builds and runs @hotel/api from within the full Rush monorepo.
#
# This is a pragmatic single-stage build: Rush + PNPM workspaces link packages via
# symlinks into common/temp, which makes copying a pruned subset across build stages
# fragile. Keeping everything in one stage trades image size for reliability. For a
# smaller production image, see Rush's built-in "rush deploy" feature.
FROM node:22-slim

WORKDIR /repo
COPY . .

RUN node common/scripts/install-run-rush.js install
RUN node common/scripts/install-run-rush.js build --to @hotel/api

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
