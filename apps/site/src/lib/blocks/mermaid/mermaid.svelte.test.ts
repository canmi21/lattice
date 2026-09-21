import { cleanup, render, screen, setup, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Mermaid from './mermaid.svelte';

/**
 * The template, with Mermaid itself replaced.
 *
 * Mermaid measures its labels with `getBBox`, which jsdom does not implement and happy-dom
 * answers with an all-zero rect -- so no shim can draw a real diagram, and the component's own
 * two branches are what is under test here. `mermaid.test.ts` beside this holds the call this
 * one stubs.
 */
const { renderMermaid } = vi.hoisted(() => ({ renderMermaid: vi.fn() }));
vi.mock('./mermaid', () => ({ renderMermaid }));

const SOURCE = 'flowchart LR\nA --> B';

/** A render held open, so each test settles it in the direction it is about. */
function diagram() {
	let resolve!: (result: { light: string; dark: string }) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<{ light: string; dark: string }>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	renderMermaid.mockReturnValue(promise);
	return { resolve, reject };
}

/** Both drawings of one diagram, told apart by what their single `text` node says. */
function drawings(light = 'A', dark = 'A in the dark') {
	return { light: `<svg><text>${light}</text></svg>`, dark: `<svg><text>${dark}</text></svg>` };
}

function mount(props: { description?: string | undefined } = {}) {
	return render(Mermaid, {
		props: { source: SOURCE, loadingLabel: 'Drawing', description: 'A to B', ...props },
	});
}

// Explicit because this project does not run with `globals: true`, which is what the library
// otherwise detects to install these two itself. `setup` is what teaches `waitFor` to await
// Svelte's tick; without it the effect's async hop is only reached by polling.
beforeEach(setup);
afterEach(cleanup);

it('shows the drawn diagram, and not its source', async () => {
	const { resolve } = diagram();
	const { container } = mount();

	// The third arm, asserted before the render settles because it is the only place the second
	// literal shows: `{:else if true || failed}` left the two states below looking correct and
	// put the source fallback here, where the placeholder belongs.
	expect(screen.getByRole('status')).toBeDefined();
	expect(container.querySelector('pre')).toBeNull();

	resolve(drawings());
	await screen.findByRole('img', { name: 'A to B' });

	expect(container.querySelector('.mermaid-result svg')).not.toBeNull();
	// Both branches were once pinned to literals -- `{#if false && svg}` and `{:else if true ||
	// failed}` -- so the diagram was computed and then discarded, and success rendered the same
	// source fallback as failure. Asserting only that one direction shows what it should passes
	// in both, which is how every diagram on the site became its own listing.
	expect(container.querySelector('pre')).toBeNull();
	expect(container.querySelector('code')).toBeNull();
});

it('leaves the diagram unlabelled until a description has been written', async () => {
	const { resolve } = diagram();
	const { container } = mount({ description: undefined });

	resolve(drawings());
	await waitFor(() => expect(container.querySelector('.mermaid-result svg')).not.toBeNull());

	// `cms diagram` has not been run over every article, so an absent description is the ordinary
	// state and not an edge. Both attributes have to go together: `role="img"` with no name hides
	// the `text` nodes a reader could otherwise still hear, and announces nothing in their place.
	expect(screen.queryByRole('img')).toBeNull();
	expect(container.querySelector('.mermaid-result')?.getAttribute('aria-label')).toBeNull();
});

it('falls back to the readable source, and draws nothing', async () => {
	const { reject } = diagram();
	const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
	const { container } = mount();

	reject(new Error('mermaid said no'));
	await waitFor(() => expect(container.querySelector('pre > code')).not.toBeNull());

	expect(container.querySelector('pre > code')?.textContent).toBe(SOURCE);
	expect(container.querySelector('svg')).toBeNull();
	expect(screen.queryByRole('img')).toBeNull();
	expect(reported).toHaveBeenCalledWith('Could not render Mermaid diagram', expect.any(Error));
});

it('turns the theme by picking the other drawing, without rendering again', async () => {
	const { resolve } = diagram();
	const { container } = mount();

	resolve(drawings());
	await screen.findByRole('img', { name: 'A to B' });
	expect(container.querySelector('.mermaid-result svg text')?.textContent).toBe('A');
	expect(renderMermaid).toHaveBeenCalledOnce();

	document.documentElement.classList.add('dark');
	// Both drawings were already in hand, so the swap owes nothing to the renderer. A second
	// call here would be the frame of lag this arrangement exists to remove -- see
	// spec/styling/blocks.md, "A diagram is drawn in both themes at once, because the palette is
	// inside the SVG".
	await waitFor(() =>
		expect(container.querySelector('.mermaid-result svg text')?.textContent).toBe('A in the dark'),
	);
	expect(renderMermaid).toHaveBeenCalledOnce();

	document.documentElement.classList.remove('dark');
});
