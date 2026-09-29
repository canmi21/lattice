# syntax=docker/dockerfile:1
# Postgres, the image every app's database sidecar runs: the official image at a pinned major and
# digest, sized for a small instance. A new major is a new driver, never this line. See
# spec/architecture/databases.md, "The drivers".
FROM postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
# Alpine's `postgres`, by number; host gives each app's `postgres/` directory to this user.
USER 70:70
# The entrypoint initializes the cluster on a first start and passes these on to the server.
CMD ["postgres", \
	"-c", "shared_buffers=32MB", \
	"-c", "max_connections=20", \
	"-c", "max_worker_processes=2", \
	"-c", "max_parallel_workers=0", \
	"-c", "max_parallel_workers_per_gather=0", \
	"-c", "max_parallel_maintenance_workers=0"]
