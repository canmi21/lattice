/**
 * A picture-in-picture window the page draws itself, where the browser offers one: Chromium's
 * Document Picture-in-Picture. The clip's own element is moved into it and back, so it plays on
 * without a gap, and the window is given the page's styles, theme and language so the chrome in
 * it is the chrome on the page. Elsewhere the browser's own window is used instead. See
 * spec/architecture/video/player.md, "Picture in picture is ours where the browser allows it".
 */

type DocumentPictureInPicture = {
	requestWindow: (options: { width: number; height: number }) => Promise<Window>;
};

function api(): DocumentPictureInPicture | undefined {
	return (globalThis as { documentPictureInPicture?: DocumentPictureInPicture })
		.documentPictureInPicture;
}

/** Whether this browser lets the page draw its own picture-in-picture window. */
export function ownable(): boolean {
	return api() !== undefined;
}

/**
 * The widest a window opens at, so a clip from a wide column does not arrive as a second screen.
 * The reader resizes it from there, and the browser keeps what they chose.
 */
const WIDEST = 480;

/**
 * Open the window at the clip's shape and dress it as the page: the stylesheets copied rule by
 * rule, or linked where their rules cannot be read, under a `<base>` so what they name by a
 * relative address -- a font file -- is found; and the root's classes, `lang` and data
 * attributes, so the theme and the language the tokens read are the page's.
 */
export async function openWindow(width: number, height: number): Promise<Window> {
	const opener = api();
	if (!opener) throw new Error('document picture-in-picture is not offered here');
	const scale = Math.min(1, WIDEST / Math.max(width, 1));
	const pip = await opener.requestWindow({
		width: Math.round(width * scale),
		height: Math.round(height * scale),
	});
	const target = pip.document;
	const base = target.createElement('base');
	base.href = document.baseURI;
	target.head.append(base);
	for (const sheet of document.styleSheets) {
		try {
			const style = target.createElement('style');
			style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
			target.head.append(style);
		} catch {
			if (!sheet.href) continue;
			const link = target.createElement('link');
			link.rel = 'stylesheet';
			link.href = sheet.href;
			target.head.append(link);
		}
	}
	const from = document.documentElement;
	const to = target.documentElement;
	to.className = from.className;
	to.lang = from.lang;
	for (const { name, value } of from.attributes) {
		if (name.startsWith('data-')) to.setAttribute(name, value);
	}
	target.title = document.title;
	// The window's own margin and ground, here rather than in a stylesheet: a rule for `body`
	// shipped with the component would reach the article's page as well.
	target.body.style.margin = '0';
	target.body.style.background = 'black';
	return pip;
}

/**
 * Move `element` out of the article into a window of its own, and back where it stood when the
 * window closes -- by the row's control, the page's, or the browser's. `fill` draws the window's
 * content and registers what to undo on closing. The frame keeps the shape it had while the
 * element is away, as a ratio, since the element is what gave it its height. Undefined when the
 * window was refused: no gesture left, or one already open.
 */
export async function moveToWindow(
	element: HTMLVideoElement,
	frame: HTMLElement,
	fill: (target: HTMLElement, onClose: (undo: () => void) => void) => void,
): Promise<{ release: () => void; closed: Promise<void> } | undefined> {
	const box = frame.getBoundingClientRect();
	let pip: Window;
	try {
		pip = await openWindow(box.width, box.height);
	} catch {
		return undefined;
	}
	const parent = element.parentNode;
	const next = element.nextSibling;
	const ratio = frame.style.aspectRatio;
	frame.style.aspectRatio = `${box.width} / ${box.height}`;
	const undos: (() => void)[] = [];
	fill(pip.document.body, (undo) => undos.push(undo));
	let done!: () => void;
	const closed = new Promise<void>((resolve) => {
		done = resolve;
	});
	const release = () => {
		pip.removeEventListener('pagehide', release);
		for (const undo of undos) undo();
		parent?.insertBefore(element, next);
		frame.style.aspectRatio = ratio;
		if (!pip.closed) pip.close();
		done();
	};
	pip.addEventListener('pagehide', release);
	return { release, closed };
}
