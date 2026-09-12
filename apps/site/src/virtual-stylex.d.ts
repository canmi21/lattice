declare module 'virtual:stylex:runtime' {
	// Development only. Importing it subscribes the page to StyleX's own hot updates; the
	// plugin serves the stylesheet at /virtual:stylex.css rather than emitting an asset, so
	// nothing is exported and nothing is read. See spec/architecture/css.md.
}
