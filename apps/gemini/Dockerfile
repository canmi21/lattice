# syntax=docker/dockerfile:1
# gemini-web2api as the node runs it: the upstream image at a pinned version, told where its
# database and port are. Moving to a new version is this one line. See spec/architecture/host.md,
# "An upstream image is adopted, not rebuilt".
FROM ghcr.io/zexadev/gemini-web2api-go:v4.20.1
# The image's own `nonroot`, by number, so host gives its directory to the user that writes it.
USER 65532:65532
CMD ["--db", "/data/gemini.db", "--port", "20830"]
