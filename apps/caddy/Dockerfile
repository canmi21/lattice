# syntax=docker/dockerfile:1
# Caddy, as the node runs it: the official build with the two modules this platform needs, the
# Cloudflare DNS provider its certificates are proven with and the rate limiter host renders each
# service's limits into. See spec/architecture/host.md, "Caddy is deployed like any app, and is the
# one door". Built from the repository root by `mise run image`, whose arguments it does not read.
ARG CADDY_VERSION=2.11.4

FROM caddy:${CADDY_VERSION}-builder AS build
RUN xcaddy build \
	--with github.com/caddy-dns/cloudflare \
	--with github.com/mholt/caddy-ratelimit

FROM caddy:${CADDY_VERSION}
COPY --from=build /usr/bin/caddy /usr/bin/caddy
# Everything it serves is what host rendered; nothing is read from a Caddyfile.
CMD ["caddy", "run", "--config", "/etc/caddy/host/caddy.json"]
