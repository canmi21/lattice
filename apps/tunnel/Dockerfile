# syntax=docker/dockerfile:1
# cloudflared as the node runs it: the upstream image at a pinned version, run as a
# remotely-managed tunnel. Moving to a new version is this one line. See
# spec/architecture/host.md, "The tunnel is deployed like any app, at the address Caddy trusts".
FROM cloudflare/cloudflared:2026.9.3
# Its token is `TUNNEL_TOKEN`, from the node; its metrics answer host's health check.
CMD ["tunnel", "--no-autoupdate", "--protocol", "quic", "--metrics", "0.0.0.0:20820", "run"]
