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
	&& cargo build --profile container --locked --target "$target" -p meter \
	&& cp "target/$target/container/meter" /meter

FROM scratch
COPY --from=build /meter /meter
# Where the observer shape mounts the machine's own; see spec/architecture/meter.md.
ENV METER_PROC=/host/proc METER_SYS=/host/sys METER_DATA=/data
# Not root, least of all here: it shares the machine's PIDs, and a root process there could signal
# the machine's own. Named by number, since scratch has no user table.
USER 65532:65532
ENTRYPOINT ["/meter"]
