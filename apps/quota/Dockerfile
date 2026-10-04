# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# `quota` at home: its Node entry bundled with every dependency into one file, so the image
# is Node and that file alone. Built from the repository root by `mise run image`, which reads
# NODE_VERSION from the workspace's mise.toml. See spec/architecture/host.md, "The inside side
# answers the internal gateway alone".
ARG NODE_VERSION

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /src
# The pnpm the repository names, since this Node carries no corepack to pick it.
COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager")"
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --filter "@canmi/quota..." \
	&& pnpm --filter @canmi/quota run bundle

FROM node:${NODE_VERSION}-slim
WORKDIR /quota
COPY --from=build /src/apps/quota/dist/node.mjs ./
# The image's own `node` user, by number, so host runs it as that and nothing more.
USER 1000:1000
ENV NODE_ENV=production
CMD ["node", "node.mjs"]
