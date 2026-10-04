// Modules Vite invents, which no package ships types for. Copied from the site's own
// declaration, which is the rule for this application -- see spec/architecture/workspace.md,
// "The editor is configured by reading the site, not by working it out again".

// Supplied by @stylexjs/unplugin/vite, not by a plugin of ours.
declare module 'virtual:stylex:runtime' {
	// Development only. Importing it subscribes the page to StyleX's own hot updates; the
	// plugin serves the stylesheet at /virtual:stylex.css rather than emitting an asset, so
	// nothing is exported and nothing is read. See spec/architecture/css/layers.md.
}
