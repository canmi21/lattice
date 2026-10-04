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
COPY lib lib
COPY infra infra
RUN --mount=type=cache,target=/usr/local/cargo/registry \
	--mount=type=cache,target=/src/target \
	case "$TARGETARCH" in arm64) arch=aarch64 ;; amd64) arch=x86_64 ;; *) exit 1 ;; esac \
	&& target="$arch-unknown-linux-musl" \
	&& rustup target add "$target" \
	&& export "CC_${arch}_unknown_linux_musl=musl-gcc" \
	&& cargo build --profile container --locked --target "$target" -p geo \
	&& cp "target/$target/container/geo" /geo

# GeoNames, fetched as the image is built, so the data is as new as the build. `ADD` of a URL is
# cached by the server's ETag, so an unchanged file is not fetched again and a changed one is.
# `mise run geo` exports this stage for local work, so these addresses are the only copy.
FROM debian:trixie-slim AS fetch
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends unzip \
	&& rm -rf /var/lib/apt/lists/*
ADD https://download.geonames.org/export/dump/cities500.zip /fetch/
ADD https://download.geonames.org/export/zip/allCountries.zip /fetch/
ADD https://download.geonames.org/export/dump/admin1CodesASCII.txt /geo/
ADD https://download.geonames.org/export/dump/admin2Codes.txt /geo/
ADD https://download.geonames.org/export/dump/countryInfo.txt /geo/
# A URL's file arrives mode 600, and the service reads it as 65532.
RUN unzip -q /fetch/cities500.zip -d /geo \
	&& unzip -q -p /fetch/allCountries.zip allCountries.txt > /geo/postal.txt \
	&& chmod 0644 /geo/*

FROM scratch AS data
COPY --from=fetch /geo /

FROM scratch
COPY --from=build /geo /geo
# Read-only data travelling with the binary, so every copy of the service is whole.
COPY --from=data / /data
# Not root: nothing here needs to be, and scratch has no user table, so it is named by number.
USER 65532:65532
ENTRYPOINT ["/geo"]
