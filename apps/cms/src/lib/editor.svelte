<script lang="ts">
	/**
	 * The editor whose document is the markdown text. See spec/architecture/local.md, "The editor's
	 * document is the markdown text".
	 *
	 * CodeMirror holds the text, and nothing converts it: what is saved is what was typed. How it
	 * looks is drawn over it from the site's syntax tree -- text-state.ts -- inside the root the
	 * article body is drawn under, so the page's own rules style the elements the drawing makes.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
	import { EditorState } from '@codemirror/state';
	import { EditorView, keymap } from '@codemirror/view';
	import ProseRoot from '@canmi/prose/prose-root.svelte';
	import { titleStyles } from '@canmi/prose/section-title';
	import { onMount } from 'svelte';
	import { format, formatBar } from './text-bar';
	import { blockHandle } from './text-handle';
	import { enter, lineBreak } from './text-keys';
	import { pairedDelete } from './text-pairs';
	import { reading } from './text-state';
	import { wrapOnType } from './text-wrap';

	let {
		markdown,
		language,
		onChange,
	}: { markdown: string; language: string; onChange: (value: string) => void } = $props();

	let host: HTMLDivElement;

	// What `section.svelte` puts on a heading, and the room above one. See spec/styling/rail.md.
	const HEADING = stylex.attrs(titleStyles.title).class ?? '';

	const styles = stylex.create({
		soft: { color: 'var(--color-text-muted)', userSelect: 'none', paddingInlineStart: '0.125rem' },
	});

	// The editor's own look is taken away: the text is set in the article's type, not a code font,
	// and the page already says where writing happens, so no outline is drawn around it.
	const plain = EditorView.theme({
		'&': { color: 'inherit', backgroundColor: 'transparent' },
		'&.cm-focused': { outline: 'none' },
		'.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit', overflow: 'visible' },
		'.cm-content': { padding: '0', minHeight: '24rem', caretColor: 'var(--color-text-strong)' },
		'.cm-line': { padding: '0' },
	});

	onMount(() => {
		const field = reading({
			heading: () => HEADING,
			link: 'focus-link spring-underline article-link',
			gap: (pixels) => `gap-${pixels}`,
			blank: 'blank',
			quote: { line: 'quote', first: 'quote-first', last: 'quote-last' },
			rule: 'rule-line',
			source: { line: 'source', first: 'source-first', last: 'source-last' },
			only: 'only',
			// A block is compiled in the draft's language, or the source language when none is set.
			language: () => language || 'en-US',
			soft: stylex.attrs(styles.soft).class ?? '',
		});
		const tree = (state: EditorState) => state.field(field).tree;
		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				// Seeded once and never again: the editor owns the text while it is open, and an
				// editor re-seeded on every keystroke moves the caret. What it holds goes up through
				// `onChange`, and the page decides when that becomes a row.
				doc: markdown,
				extensions: [
					history(),
					keymap.of([
						{ key: 'Enter', run: enter(() => tree(view.state)) },
						{ key: 'Shift-Enter', run: lineBreak },
						// The marks the bar sets, on the keys the bar names.
						{ key: 'Mod-b', run: format(tree, 'strong') },
						{ key: 'Mod-i', run: format(tree, 'emphasis') },
						{ key: 'Mod-Alt-x', run: format(tree, 'delete') },
						{ key: 'Mod-e', run: format(tree, 'inlineCode') },
						...(['Backspace', 'Delete'] as const).map((key) => ({
							key,
							run: (target: EditorView) => {
								const spec = pairedDelete(target.state, tree(target.state), key === 'Delete');
								if (spec) target.dispatch(spec);
								return !!spec;
							},
						})),
						...defaultKeymap,
						...historyKeymap,
						// Undo and redo answer to Ctrl on every system, the Mac included, beside the
						// ⌘ the history's own keys bind there: one hand's habit works on all three.
						{ key: 'Ctrl-z', run: undo, preventDefault: true },
						{ key: 'Ctrl-Shift-z', run: redo, preventDefault: true },
						{ key: 'Ctrl-y', run: redo, preventDefault: true },
					]),
					field,
					wrapOnType,
					blockHandle(tree),
					formatBar(tree),
					EditorView.lineWrapping,
					plain,
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onChange(update.state.doc.toString());
					}),
				],
			}),
		});
		return () => view.destroy();
	});
</script>

<ProseRoot><div class="text-editor" bind:this={host}></div></ProseRoot>

<style>
	/* The editor's lines, drawn as the page's blocks. CodeMirror renders every line as a
	   `.cm-line` with no element to say what it is, so the page's rules for `p`, `h2` and
	   `blockquote` cannot reach them; these are those rules again, addressed to the lines the
	   drawing classes. The numbers are the preview's, measured -- see paint.ts, `BLANK`. An escape
	   hatch, because the elements are the editor's own rendering and carry no class of ours until
	   the drawing gives them one. */

	/* Room above a block beyond the blank line before it. */
	.text-editor :global(.cm-line.gap-16) {
		padding-top: 16px;
	}
	.text-editor :global(.cm-line.gap-24) {
		padding-top: 24px;
	}
	.text-editor :global(.cm-line.gap-32) {
		padding-top: 32px;
	}

	/* A blank line between blocks is the page's gap between two paragraphs. */
	.text-editor :global(.cm-line.blank) {
		line-height: 16px;
	}

	/* A quote: the article body's blockquote, drawn across the lines it spans. */
	.text-editor :global(.cm-line.quote) {
		padding-inline: 1.375rem 1.125rem;
		border-left: 0.125rem solid var(--color-border-strong);
		background: var(--color-paper-hover);
		color: var(--color-text-strong);
	}
	.text-editor :global(.cm-line.quote-first) {
		padding-top: 1rem;
		border-top-right-radius: 0.625rem;
	}
	.text-editor :global(.cm-line.quote-last) {
		padding-bottom: 1rem;
		border-bottom-right-radius: 0.625rem;
	}

	/* A rule sits in its own line, which already has the room around it. */
	/* A rendered block's source while the caret is in it: on the frame a code block is drawn in,
	   in the code face, so it reads as source and not as prose. */
	.text-editor :global(.cm-line.source) {
		padding-inline: 1rem;
		background: var(--color-paper);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	.text-editor :global(.cm-line.source-first) {
		padding-top: 0.75rem;
		border-top-left-radius: 0.75rem;
		border-top-right-radius: 0.75rem;
	}
	.text-editor :global(.cm-line.source-last) {
		padding-bottom: 0.75rem;
		border-bottom-left-radius: 0.75rem;
		border-bottom-right-radius: 0.75rem;
	}
	/* The first line's own room, which a source frame's padding would otherwise replace. */
	.text-editor :global(.cm-line.source-first.gap-16) {
		margin-top: 16px;
		padding-top: 0.75rem;
	}
	.text-editor :global(.cm-line.source-first.gap-24) {
		margin-top: 24px;
		padding-top: 0.75rem;
	}
	.text-editor :global(.cm-line.source-first.gap-32) {
		margin-top: 32px;
		padding-top: 0.75rem;
	}

	/* A `:t` run the page shows at one width only; the editor shows it at every width. */
	.text-editor :global(.only) {
		text-decoration-line: underline;
		text-decoration-style: dashed;
		text-underline-offset: 4px;
	}

	/* A rendered block takes the pointer as the page does; pressing it opens its source. */
	.text-editor :global(.rendered) {
		cursor: pointer;
		/* The component is the page's markup, not the editor's text: CodeMirror sets its content
		   to preserve whitespace, and inherited here every newline in a component's markup would
		   draw as a line of its own. */
		white-space: normal;
	}

	/* The line is the rule's own height, so the room around it is the gap and nothing more. */
	.text-editor :global(.cm-line.rule-line) {
		/* The size too: the caret's placeholders beside a widget are sized in ems and would
		   otherwise hold the line open. Only while the rule is drawn; its dashes are shown in
		   the ordinary line. */
		font-size: 0;
		line-height: 0;
	}
	.text-editor :global(.cm-line .rule) {
		display: inline-block;
		width: 100%;
		vertical-align: top;
	}
	.text-editor :global(.cm-line .rule hr) {
		margin-block: 0;
	}
</style>
