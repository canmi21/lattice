# syntax=docker/dockerfile:1
# The house's DNS: CoreDNS as upstream builds it, at a pinned version, with only what the node needs
# said on top. host renders the Corefile it reads. See spec/architecture/host.md, "The resolver
# answers the gateway's names, and passes the rest on".
FROM coredns/coredns:1.14.7
# Not root, by number; it answers above the ports a user may not bind, and the node publishes 53.
USER 65532:65532
CMD ["-conf", "/etc/coredns/Corefile"]
