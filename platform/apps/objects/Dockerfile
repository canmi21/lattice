# syntax=docker/dockerfile:1
# Versity S3 Gateway, the image every app's object storage sidecar runs: the upstream image at a
# pinned version, serving the directory host mounts at /data over the posix backend. Moving to a
# new version is this one line. See spec/architecture/objects.md, "The driver is deployed like an
# app, and is not one".
FROM versity/versitygw:v1.8.0
# The upstream image runs as root; a sidecar runs as nobody in particular, by number, and host
# gives the app's `objects/` directory and its buckets to this user.
USER 65532:65532
# Its root account, port, region and health path are host's to give, as Versity's own
# ROOT_ACCESS_KEY_ID, ROOT_SECRET_ACCESS_KEY, VGW_PORT, VGW_REGION and VGW_HEALTH.
CMD ["posix", "/data"]
