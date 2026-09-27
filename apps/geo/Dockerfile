# syntax=docker/dockerfile:1
# check=skip=InvalidDefaultArgInFrom
# Built from the repository root, for the machine at home: `mise run host deploy geo`.
# RUST_VERSION has no default on purpose, which is the check skipped above: the task reads it
# from the workspace's rust-toolchain.toml, so the compiler here is the one every check runs.
ARG RUST_VERSION

FROM rust:${RUST_VERSION}-slim-trixie AS build
WORKDIR /src
# Cargo reads every workspace member's manifest and targets, so all of apps/ and libs/ come;
# only geo and what it depends on is compiled.
COPY Cargo.toml Cargo.lock ./
COPY apps apps
COPY libs libs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
	--mount=type=cache,target=/src/target \
	cargo build --release --locked -p geo && cp target/release/geo /geo

FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=build /geo /geo
# GeoNames' dumps travel with the binary: read-only data, so every copy of the service is whole.
COPY data/source/geo /data
EXPOSE 8080
ENTRYPOINT ["/geo"]
