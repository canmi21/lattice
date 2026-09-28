# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# Built from the repository root by `mise run host`. RUST_VERSION has no default on purpose, which
# is the check skipped above: the task reads it from the workspace's rust-toolchain.toml.
ARG RUST_VERSION

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
ENTRYPOINT ["/host"]
