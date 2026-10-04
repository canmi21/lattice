# Objects: an S3 surface over an app's own directory

What R2 is to a Worker, this is to an app on a node: an app that declares it gets an S3 endpoint,
credentials and its buckets, and never sees how they are kept. The keeping is Versity S3 Gateway
over plain files, run by host beside the app. Nothing uses it yet; it is built so the first app
that needs one -- a photo library -- declares it and has it.

## A sidecar per app, over the app's own directory

**An app asks with `[objects]` in its `service.toml`, and host runs `<app>-objects` beside it.**

```toml
[objects]
buckets = ["photos", "thumbs"]
```

- **The data is the app's**: the sidecar mounts `/data/apps/<app>/objects/` and nothing else, a
  bucket a directory under it and an object a plain file, its content type and ETag in extended
  attributes. So the snapshot a deploy takes of the app's subvolume holds its objects too, and a
  rollback with data puts them back with everything else. A picture is a picture on the disk: it
  reads with `ls` and `cp`, and a copy that keeps extended attributes -- `btrfs send`, `rsync -X` --
  keeps its metadata.
- **It is on its app's network and no other**, on the port the platform gives every sidecar, 17070. That network is shared with host, for health checks, and Caddy, but no name is routed to
  the sidecar, so nothing outside the node reaches it, and no other app is on it.
- **The app is handed the binding as its environment**: `S3_ENDPOINT`, `S3_REGION`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_BUCKETS`. host makes the credentials once, keeps
  them in the app's `secret.env` beside what the app's own secrets are, and gives the same pair to
  the sidecar as its root account. The panel names them and never shows them, as it does every
  secret.
- **It lives and dies with its app**: started, stopped, restarted, redeployed and rolled back when
  the app is -- started before the app and answering its health path within thirty seconds,
  stopped after it -- so the app never meets an endpoint that is not there yet, and a deploy's
  snapshot is taken with both at rest. An app that declares `[objects]` while no driver is deployed
  is refused.
- **A rollback with data puts the app's `secret.env` back with everything else**, while the pair
  the app and its sidecar start with is the one read before the restore; the two always match each
  other, and the file on disk is what the next deploy uses.
- **A bucket declared is a directory made**, owned by the sidecar's user; one no longer declared is
  left as it is, never deleted.

**One Versity per app, not one for the node**, because a shared one would keep the objects outside
each app's subvolume, where neither its snapshot nor its rollback reaches them, and would let one
app's credentials be a policy away from another's files. The cost is one small process per app that
asks, measured and capped as every container is.

## The driver is deployed like an app, and is not one

**`platform/apps/objects` is the image, and deploying it upgrades every sidecar.** Its Dockerfile is the
upstream Versity image at a pinned version with the posix backend's command, per host.md, "An
upstream image is adopted, not rebuilt"; CI builds it like anything else, and host takes it as the
driver's version: it runs no container of its own under that name, and recreates each app's sidecar
on the new image, one app at a time; if one fails, every sidecar already moved goes back to the
previous image and the deploy fails. Rolling the driver back is rolling back `objects`. It has no
container to start or stop, so the panel offers it neither. Its
`service.toml` states the sidecar's port and memory ceiling, which every sidecar takes.

The name `objects` is reserved, and so is every `<app>-objects`: no app may take one.
