# syntax=docker/dockerfile:1
# The house's DNS: CoreDNS as upstream builds it, at a pinned version, with only what the node needs
# said on top. host renders the Corefile it reads. See spec/architecture/host.md, "The resolver
# answers the gateway's names, and passes the rest on".
FROM coredns/coredns:1.14.7 AS upstream

# Upstream's binary carries a file capability to bind 53, which a container with every capability
# dropped and no new privileges refuses to exec at all. It answers on 1053 here, so it is taken off.
FROM debian:trixie-slim AS strip
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends libcap2-bin \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=upstream /coredns /coredns
RUN setcap -r /coredns

FROM scratch
COPY --from=strip /coredns /coredns
# Not root, by number; it answers above the ports a user may not bind, and the node publishes 53.
USER 65532:65532
ENTRYPOINT ["/coredns"]
CMD ["-conf", "/etc/coredns/Corefile"]
