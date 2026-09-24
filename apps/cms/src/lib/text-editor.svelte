<script lang="ts">
	/**
	 * The editor whose document is the markdown text. See spec/architecture/local.md, "The editor's
	 * document is the markdown text".
	 *
	 * CodeMirror holds the text, and nothing converts it: what is saved is what was typed. How it
	 * looks is drawn over it from the site's syntax tree -- text-state.ts -- inside the root the
	 * article body is drawn under, so the page's own rules style the elements the drawing makes.
	 * It replaces editor.svelte step by step; until it has everything that one has, it is opened
	 * with `?editor=text`.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { EditorState } from '@codemirror/state';
	import { EditorView, keymap } from '@codemirror/view';
	import ProseRoot from '@canmi/prose/prose-root.svelte';
	import { titleStyles } from '@canmi/prose/section-title';
	import { onMount } from 'svelte';
	import { enter, lineBreak } from './text-keys';
	import { reading } from './text-state';
	import { wrapOnType } from './text-wrap';

	let { markdown, onChange }: { markdown: string; onChange: (value: string) => void } = $props();

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
			heading: (depth) => `${HEADING} ${depth === 2 ? 'pt-12' : 'pt-8'}`,
			link: 'article-link',
			soft: stylex.attrs(styles.soft).class ?? '',
		});
		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				// Seeded once and never again: the editor owns the text while it is open, as
				// editor.svelte explains.
				doc: markdown,
				extensions: [
					history(),
					keymap.of([
						{ key: 'Enter', run: enter(() => view.state.field(field).tree) },
						{ key: 'Shift-Enter', run: lineBreak },
						...defaultKeymap,
						...historyKeymap,
					]),
					field,
					wrapOnType,
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

<ProseRoot><div bind:this={host}></div></ProseRoot>
