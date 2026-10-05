/** The page's name, said by its title, its entities and its web app manifest alike. */
export const NAME = 'Canmi Status';

/**
 * The app icons the web app manifest names, by the mark each is published as and the size it is
 * drawn at. See spec/architecture/manifest.md.
 */
export const APP_ICONS = {
	'web-app-manifest-192x192.png': '192x192',
	'web-app-manifest-512x512.png': '512x512',
} as const;

export type AppIcon = keyof typeof APP_ICONS;

export const APP_ICON_MARKS = Object.keys(APP_ICONS) as AppIcon[];
