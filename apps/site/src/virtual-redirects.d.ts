declare module 'virtual:redirects' {
	// Merged 301 map (built-in + site.config.yaml), baked at build and consumed by the
	// [...path] route's universal load, so it reaches the browser as well as the Worker.
	export const redirects: Record<string, string>;
}
