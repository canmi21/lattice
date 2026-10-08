/// <reference types="@cloudflare/workers-types" />

import type { Read } from '#lib/server/read.ts';
import type { Cluster } from '#lib/wire.ts';

declare global {
	namespace App {
		interface PageData {
			/** What every page's server load streams of the cluster; see src/routes/+layout.svelte. */
			cluster?: Promise<Read<Cluster>>;
		}
	}

	namespace Cloudflare {
		/**
		 * The Worker's bindings as `cloudflare:workers` hands them over: each node's Caddy, by its name
		 * in capitals, and the read token every node's host takes for its `GET` routes. See
		 * wrangler.jsonc, and src/lib/server/edge.ts for the type the readers take.
		 */
		interface Env {
			RDU: Fetcher;
			TYO: Fetcher;
			NRT: Fetcher;
			HND: Fetcher;
			GVX: Fetcher;
			BRU: Fetcher;
			BUF: Fetcher;
			SHA: Fetcher;
			/** A Worker secret. */
			HOST_READ_TOKEN: string;
			/** The adapter's own: the client files and the prerendered pages. */
			ASSETS: Fetcher;
		}
	}
}

export {};
