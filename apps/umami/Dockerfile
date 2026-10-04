# syntax=docker/dockerfile:1
# umami as the node runs it: the upstream image at a pinned version, told its port and where the
# gateway forwards a visitor's address. See spec/architecture/host.md, "An upstream image is
# adopted, not rebuilt".
#
# Upstream stopped publishing a version-specific `postgresql-*` tag with v3: the image now speaks
# whatever `DATABASE_URL` names, and `postgresql-latest` is kept only as an alias of the plain
# version tag. This pins that plain tag instead, at the same digest `postgresql-latest` resolves
# to today.
FROM ghcr.io/umami-software/umami:3.4.0@sha256:85909afc45bdcda1917394594a087421fdbb05610fded0fa9f6fb861abb2f367
# The image's own `nextjs`, by number, so host gives its directory to the user that writes it.
USER 1001:1001
# 3000 is the image's own default, moved into our range. See spec/architecture/services.md, "A
# service keeps one port".
ENV PORT=13000
ENV HOSTNAME=0.0.0.0
# It phones its own cloud otherwise. See spec/analytics.md.
ENV DISABLE_TELEMETRY=1
# The header the gateway forwards a visitor's address in, unchanged from what Cloudflare sent it --
# see spec/architecture/services.md, "The gateway marks what it passes on" -- and the same one
# geo's `resolve_address` reads. See spec/analytics.md, "Neither service is
# self-hosted, and analytics of our own comes later".
ENV CLIENT_IP_HEADER=cf-connecting-ip
