/// <reference types="@cloudflare/workers-types" />

// Runtime APIs for this worker. The reference sits here rather than in tsconfig.workers.json's
// `types` because that field resolves from the directory holding the config, and the package is
// installed per workspace member -- so the root cannot see it and this file can.
