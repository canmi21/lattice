# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# The panel, host's interface: a SvelteKit server on Node, every dependency bundled into the build,
# so the image is Node and that build alone. Built from the repository root by `mise run image`,
# which reads NODE_VERSION from the workspace's mise.toml. See spec/architecture/host.md, "The
# panel is an app of its own".
ARG NODE_VERSION

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /src
# The pnpm the repository names, since this Node carries no corepack to pick it.
COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager")"
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --filter "@canmi/panel..." \
	&& pnpm --filter @canmi/panel build

FROM node:${NODE_VERSION}-slim
WORKDIR /panel
COPY --from=build /src/apps/panel/package.json ./
COPY --from=build /src/apps/panel/build ./build
# The image's own `node` user, by number, so host runs it as that and nothing more.
USER 1000:1000
ENV PORT=26519 HOST=0.0.0.0 NODE_ENV=production
CMD ["node", "build"]
