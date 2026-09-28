# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# Built from the repository root by `mise run host`. RUST_VERSION has no default on purpose, which
# is the check skipped above: the task reads it from the workspace's rust-toolchain.toml.
ARG RUST_VERSION

# Static, against musl, as meter and geo are.
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
	&& cargo build --profile container --locked --target "$target" -p apt \
	&& cp "target/$target/container/apt" /apt

FROM scratch
COPY --from=build /apt /apt
ENV APT_DATA=/data
# scratch has no /var/run -> /run symlink, so zbus's default system-bus lookup is pointed at the
# path the machine's socket is mounted to. See spec/architecture/apt.md, "The door".
ENV DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket
# Root, and only for systemd's sake: the bus lets a unit be started only from there. No other
# capability is asked for, and the root filesystem stays host's to make read-only. See
# spec/architecture/apt.md, "The door".
ENTRYPOINT ["/apt"]
