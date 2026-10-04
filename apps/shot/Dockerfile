# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# Built from the repository root by `mise run host`. RUST_VERSION has no default on purpose, which
# is the check skipped above: the task reads it from the workspace's rust-toolchain.toml.
ARG RUST_VERSION

# Static, against musl, as geo is; see its Dockerfile.
FROM rust:${RUST_VERSION}-slim-trixie AS build
ARG TARGETARCH
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends musl-tools \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps apps
COPY libs libs
COPY lib lib
COPY infra infra
RUN --mount=type=cache,target=/usr/local/cargo/registry \
	--mount=type=cache,target=/src/target \
	case "$TARGETARCH" in arm64) arch=aarch64 ;; amd64) arch=x86_64 ;; *) exit 1 ;; esac \
	&& target="$arch-unknown-linux-musl" \
	&& rustup target add "$target" \
	&& export "CC_${arch}_unknown_linux_musl=musl-gcc" \
	&& cargo build --profile container --locked --target "$target" -p shot \
	&& cp "target/$target/container/shot" /shot

# The browser travels with the service, so they start, stop and are limited together. Debian's
# headless shell rather than the browser, which brings a desktop's libraries along; Debian's since
# Google builds none for Linux on arm64. Noto for Latin, Chinese and Japanese, and no emoji. See
# spec/architecture/shot.md, "One browser, a context per capture".
FROM debian:trixie-slim
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends chromium-headless-shell fontconfig fonts-noto-core fonts-noto-cjk \
	&& rm -rf /var/lib/apt/lists/* \
	&& fc-cache --force
COPY --from=build /shot /usr/local/bin/shot
# The root is read-only and /tmp is small, so the browser's profile, cache and shared memory go to
# the service's own directory, which it makes as it starts.
ENV SHOT_BROWSER=/usr/bin/chromium-headless-shell SHOT_DATA=/data HOME=/data/home TMPDIR=/data/tmp
# Not root: nothing here needs to be.
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/shot"]
