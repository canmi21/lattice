# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# Built from the repository root: `mise run host image host <path>` for the first start by hand.
# RUST_VERSION has no default on purpose, which is the check skipped above: the task reads it
# from the workspace's rust-toolchain.toml, so the compiler here is the one every check runs.
ARG RUST_VERSION

FROM rust:${RUST_VERSION}-slim-trixie AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps apps
COPY libs libs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
	--mount=type=cache,target=/src/target \
	cargo build --profile container --locked -p host && cp target/container/host /host

# Not distroless: host snapshots each app's directory with btrfs-progs.
FROM debian:trixie-slim
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends btrfs-progs ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /host /usr/local/bin/host
ENTRYPOINT ["host"]
