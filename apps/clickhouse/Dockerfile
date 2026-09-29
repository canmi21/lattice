# syntax=docker/dockerfile:1
# Built from source: the node's chip is ARMv8.0 and ClickHouse's own arm64 build needs ARMv8.2,
# dying with SIGILL on it, and the build that does not -- `aarch64v80compat` -- is published for
# master alone. APP_VERSION is the newest stable release tag, resolved by `version` beside this
# file and given to both stages the same way, so the clone and the label never disagree. See
# spec/architecture/databases.md, "The drivers".
ARG APP_VERSION

FROM ubuntu:24.04 AS builder
ARG APP_VERSION
SHELL ["/bin/bash", "-o", "pipefail", "-euc"]

# Clang 21 or higher is what ClickHouse's own build docs require; apt.llvm.org is upstream LLVM's
# own installer, the one place this Dockerfile names a URL outside libs/urls, since a Dockerfile
# is not code `refs` holds to that rule. Rust stays off: the `clickhouse` target alone is built.
RUN apt-get update && apt-get install --yes --no-install-recommends \
		ca-certificates git wget gnupg lsb-release software-properties-common \
		build-essential cmake ninja-build ccache python3 nasm yasm m4 \
	&& wget -q https://apt.llvm.org/llvm.sh -O /tmp/llvm.sh \
	&& chmod +x /tmp/llvm.sh && /tmp/llvm.sh 21 \
	&& rm -rf /var/lib/apt/lists/* /tmp/llvm.sh
ENV CC=clang-21 CXX=clang++-21

RUN git clone --branch "$APP_VERSION" --depth 1 \
		https://github.com/ClickHouse/ClickHouse.git /src \
	&& cd /src && git submodule update --init --depth 1 --jobs "$(nproc)"

WORKDIR /src/build
RUN cmake -G Ninja \
		-DCMAKE_BUILD_TYPE=Release \
		-DNO_ARMV81_OR_HIGHER=1 \
		-DENABLE_TESTS=0 \
		-DENABLE_UTILS=0 \
		-DENABLE_RUST=0 \
		.. \
	&& ninja clickhouse \
	&& strip --strip-all programs/clickhouse -o /tmp/clickhouse

# The runtime stage matches the builder's glibc, so `ldd` against the binary the build stage made
# resolves against libraries this stage already carries.
FROM ubuntu:24.04 AS runtime
ARG APP_VERSION
LABEL org.opencontainers.image.version="$APP_VERSION" \
	org.canmi.lattice.clickhouse.tag="$APP_VERSION"

RUN apt-get update && apt-get install --yes --no-install-recommends \
		libssl3t64 zlib1g liblz4-1 libzstd1 libxml2 libcurl4 libicu74 libcap2 \
	&& rm -rf /var/lib/apt/lists/* \
	&& groupadd --system --gid 101 clickhouse \
	&& useradd --system --uid 101 --gid clickhouse --no-create-home --shell /usr/sbin/nologin \
		clickhouse \
	&& mkdir -p /var/lib/clickhouse && chown clickhouse:clickhouse /var/lib/clickhouse

COPY --from=builder /tmp/clickhouse /usr/bin/clickhouse
RUN ln -s /usr/bin/clickhouse /usr/bin/clickhouse-server \
	&& ln -s /usr/bin/clickhouse /usr/bin/clickhouse-client

COPY config.xml /etc/clickhouse-server/config.xml
COPY entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

USER 101:101
EXPOSE 8123
ENTRYPOINT ["/entrypoint.sh"]
