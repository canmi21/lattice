# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# Built from the repository root by `mise run host`. RUST_VERSION and NODE_VERSION have no default
# on purpose, which is the check skipped above: the task reads them from the workspace's
# rust-toolchain.toml and mise.toml.
ARG RUST_VERSION
ARG NODE_VERSION

# The panel, built as its own page and copied into the image beside the binary; see
# spec/architecture/host.md, "The panel is host's own".
FROM node:${NODE_VERSION}-slim AS panel
WORKDIR /src
# The pnpm the repository names, since this Node carries no corepack to pick it.
COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager")"
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --filter "@canmi/host-panel..." \
	&& pnpm --filter @canmi/host-panel build

# Static, against musl, so the image needs nothing but the binary. The target follows the platform
# being built, so one Dockerfile serves an arm64 node and an x86 one.
FROM rust:${RUST_VERSION}-slim-trixie AS build
ARG TARGETARCH
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends musl-tools \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps apps
COPY libs libs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
	--mount=type=cache,target=/src/target \
	case "$TARGETARCH" in arm64) arch=aarch64 ;; amd64) arch=x86_64 ;; *) exit 1 ;; esac \
	&& target="$arch-unknown-linux-musl" \
	&& rustup target add "$target" \
	&& export "CC_${arch}_unknown_linux_musl=musl-gcc" \
	&& cargo build --profile container --locked --target "$target" -p host \
	&& cp "target/$target/container/host" /host

FROM scratch
COPY --from=build /host /host
COPY --from=panel /src/apps/host/panel/build /panel
ENTRYPOINT ["/host"]
