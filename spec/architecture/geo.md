# `geo`: where a place is, and where an address is

`platform/apps/geo` answers two questions from data it holds in memory: which place is near a position,
`/geo/address`, from GeoNames; and where an IP address is, `/geo/ip`, from MaxMind's GeoLite2.
Both are public scopes of the API host: CPU alone, and cheap enough to answer anyone, within the
limits every public route has.

## `/geo/ip`: an address, looked up

**`GET /geo/ip?address=<ip>` answers the address's country, region, city, approximate position and
time zone, and its network's ASN and organization**; without `address` it looks up the caller's
own, which the gateway passes on as `Cf-Connecting-Ip`. IPv4 and IPv6 alike. An address the data
does not know answers with what it does know and nulls for the rest; one that is not an address is
`400`. It is limited per caller like `/geo/address`, in the service's `[[api.limits]]`, which the
gateway and Caddy both keep -- [services.md](services.md), "A limit is declared once and kept in
three places".

**The data is GeoLite2 City and ASN, taken daily from a mirror's releases**: the GitHub releases of
`P3TERX/GeoLite.mmdb`, which republishes MaxMind's files as `.mmdb` without a license key, so no key
lives anywhere here. The answer credits MaxMind as its license asks.

**geo fetches it itself, at run time, once a day**, into its own data directory: a new file is
downloaded beside the one in use, opened and read once to prove it whole, and swapped in atomically,
so a lookup never meets half a file and a failed download leaves yesterday's answering. It is read
memory-mapped, so the page cache holds what is asked and the heap nothing. A daily image rebuild
was the other way, and was not taken: it would redeploy a large image every day for one file.

Until the first file has arrived, `/geo/ip` answers `503` and `/geo/address` is unaffected; the
image carries no copy, so a new node's first minutes ask for one.
