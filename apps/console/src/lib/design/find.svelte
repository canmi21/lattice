<script lang="ts">
	/**
	 * The way into finding anything in the console, at the sidebar's head: drawn as a field, with its
	 * shortcut beside the word. A press makes the field live where it stands, and the first letter
	 * typed grows it right and down into ./find-body.svelte, which stays grown until it closes; the
	 * shortcut, from anywhere, opens it in ./palette.svelte instead. See spec/console/design.md, "The
	 * sidebar's head is the way in to finding".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, duration, family, radius, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import SearchIcon from '@tabler/icons-svelte-runes/icons/search';
	import { label, shortcut } from '@canmi/kit/behavior/shortcut';
	import { Popover } from 'bits-ui';
	import { tick } from 'svelte';
	import FindBody from './find-body.svelte';
	import Icon from '@canmi/design/components/icon.svelte';
	import { grow } from './motion.ts';
	import Palette from './palette.svelte';

	/** Open in place, from the field, or over the page, from the shortcut. */
	let here = $state(false);
	let palette = $state(false);
	/** What is typed in place, and whether the panel has grown from it, which it does once. */
	let query = $state('');
	let grown = $state(false);
	let field: HTMLElement | null = $state(null);
	let panel: HTMLElement | null = $state(null);

	$effect(() => {
		if (!here) grown = false;
	});
	$effect(() => {
		if (!here || grown || !query) return;
		const from = field?.getBoundingClientRect();
		grown = true;
		void tick().then(() => {
			if (panel && from) grow(panel, { width: from.width, height: from.height });
		});
	});
	// The palette's own field closes it on the same keys that opened it.
	$effect(() =>
		shortcut(
			'k',
			() => {
				here = false;
				palette = !palette;
			},
			{ inFields: true },
		),
	);

	const styles = stylex.create({
		field: {
			borderRadius: radius.md,
			backgroundColor: { default: 'var(--color-surface)', ':hover': 'var(--color-raised)' },
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line)`,
			color: 'var(--color-text-muted)',
			fontSize: text.px13,
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		/** The field made live, standing where it stood, as it looked. */
		live: {
			borderRadius: radius.md,
			backgroundColor: 'var(--color-surface)',
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line)`,
			color: 'var(--color-text-muted)',
		},
		/** Grown into the panel, over the page. */
		panel: {
			borderRadius: radius.lg,
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line), 0 12px 32px rgb(0 0 0 / 0.28)`,
			color: 'var(--color-text)',
		},
		key: {
			borderRadius: radius.sm,
			boxShadow: `0 0 0 ${border.hairlinePx} var(--color-line)`,
			fontFamily: family.monoTheme,
			fontSize: text.px12,
			color: 'var(--color-text-muted)',
		},
	});
</script>

<Popover.Root bind:open={here}>
	<Popover.Trigger
		bind:ref={field}
		aria-label="Find"
		aria-keyshortcuts="Meta+K Control+K"
		class="flex h-8 w-full cursor-pointer items-center gap-2 px-3 text-left {stylex.attrs(
			styles.field,
		).class}"
	>
		<Icon icon={SearchIcon} size={16} class="mx-px" />
		<span class="min-w-0 flex-1 truncate">Find…</span>
		<kbd class="px-1.5 leading-5 {stylex.attrs(styles.key).class}">{label('k')}</kbd>
	</Popover.Trigger>
	<Popover.Portal>
		<!-- Over the field, its top left on the field's: the field made live, then grown from it. -->
		<Popover.Content
			bind:ref={panel}
			side="bottom"
			align="start"
			sideOffset={-32}
			avoidCollisions={false}
			class="z-50 flex flex-col overflow-hidden {grown
				? 'max-h-[min(26rem,70vh)] w-[min(26rem,calc(100vw-1.5rem))]'
				: 'h-8 w-(--bits-floating-anchor-width)'} {stylex.attrs(styles.live, grown && styles.panel)
				.class}"
		>
			<FindBody open={here} close={() => (here = false)} name="find" bind:query {grown} />
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<Palette bind:open={palette} />
