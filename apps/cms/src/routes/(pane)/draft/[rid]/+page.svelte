<script lang="ts">
	/**
	 * Writing a draft: the text and nothing else on the page.
	 *
	 * What the article is -- its title, subtitle, description, address and language -- is not the
	 * writing, and it is kept out of the way of it: in a drawer at the pane's right, opened from the
	 * toolbar that floats at the pane's foot with everything else a draft can have done to it. See
	 * spec/architecture/local.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { invalidate } from '$app/navigation';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Flag from '@lucide/svelte/icons/flag';
	import FlagOff from '@lucide/svelte/icons/flag-off';
	import Funnel from '@lucide/svelte/icons/funnel';
	import LayerArrowUp from '@lucide/svelte/icons/layer-arrow-up';
	import LayersPlus from '@lucide/svelte/icons/layers-plus';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import ToggleLeft from '@lucide/svelte/icons/toggle-left';
	import ToggleRight from '@lucide/svelte/icons/toggle-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { endonym, PUBLIC_LANGUAGE } from '@canmi/locales';
	import { onMount, tick, type Component } from 'svelte';
	import { edgeReveal } from '@canmi/behavior/edge';
	import { surfaces } from '@canmi/tokens/surfaces';
	import { border, family, figures, radius, text } from '@canmi/tokens/vocabulary.stylex';
	import Editor from '$lib/editor.svelte';
	import TextEditor from '$lib/text-editor.svelte';
	import { page } from '$app/state';
	import { forget, recall, remember } from '$lib/buffer.ts';
	import { EDGE_MARGINS, useChrome } from '$lib/chrome.svelte.ts';
	import { floating } from '$lib/floating.ts';
	import { arriving, leaving, Movement } from '$lib/movement.ts';
	import {
		DRAFTS,
		splitPath,
		listRevisions,
		publishDraft,
		saveDraft,
		type Publication,
	} from '$lib/collection.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Each field starts from the row and is the page's own once typed into; moving to another
	// article resets them all, because they are derived from the draft that was loaded.
	const rid = $derived(data.draft.resource);
	let title = $derived(data.draft.meta.title ?? '');
	let subtitle = $derived(data.draft.meta.subtitle ?? '');
	let description = $derived(data.draft.meta.description ?? '');
	// Not stored yet: the collection keeps no short forms of its own, so these are the page's until
	// it does.
	let shortTitle = $derived((void data.draft, ''));
	let shortSubtitle = $derived((void data.draft, ''));
	// The address is a category and a slug, chosen apart: the category from those the corpus
	// already uses, the slug written. See `splitPath`.
	let category = $derived(splitPath(data.draft.meta.path).category);
	let slug = $derived(splitPath(data.draft.meta.path).slug);
	/** Writing a category the list does not have yet; it joins the list once a draft saves it. */
	let naming = $derived.by(() => (void data.draft, false));
	const categories = $derived(
		[
			...new Set([
				...data.articles.map((article) => splitPath(article.meta.path).category),
				category,
			]),
		]
			.filter(Boolean)
			.toSorted(),
	);
	const LANGUAGES = Object.entries(PUBLIC_LANGUAGE).map(([code, tag]) => ({
		code,
		name: endonym(tag),
	}));
	/** The value the category menu uses for writing a new one, which no category can be. */
	const NEW_CATEGORY = ':new';
	let language = $derived(data.draft.meta.language ?? '');
	let revisions = $derived(data.revisions);
	let missing = $derived.by((): string[] => (void data.draft, []));

	// The two placeholder toggles on the toolbar, which change nothing but their own icon.
	let toggled = $state(false);
	let flagged = $state(false);

	/**
	 * The drawer holding what the article is, which only the pointer brings out: running to the
	 * window's right edge opens it, and moving clear of it puts it back. Nothing pins it, so it has
	 * no control of its own to close it with.
	 */
	let details = $state<'closed' | 'open'>('closed');
	let drawerElement = $state<HTMLElement>();

	// It moves the way the sidebar does, on the same mechanism: in from the right edge, out past it.
	const movement = new Movement();
	/** Set while the drawer is going back, so the moves that follow do not start it again. */
	let closing = false;
	const across = () =>
		drawerElement ? window.innerWidth - drawerElement.getBoundingClientRect().left : 0;

	async function open() {
		if (details === 'open' && !closing) return;
		closing = false;
		details = 'open';
		await tick();
		if (!drawerElement) return;
		const distance = across();
		await movement.release(
			await movement.play(drawerElement, arriving('right', distance), distance),
		);
	}

	async function close() {
		if (details === 'closed' || closing || !drawerElement) return;
		closing = true;
		const distance = across();
		const done = await movement.play(drawerElement, leaving('right', distance), distance);
		// Opened again meanwhile: it stays.
		if (!closing) return;
		closing = false;
		details = 'closed';
		await movement.release(done);
	}

	// The right edge brings the drawer out the way the left edge brings out a folded sidebar, on the
	// same margins. See @canmi/behavior/edge.
	const edge = edgeReveal({
		side: 'right',
		...EDGE_MARGINS,
		live: () => true,
		out: () => details === 'open',
		panel: () => drawerElement,
		reveal: () => void open(),
		conceal: () => void close(),
	});

	/**
	 * The editor is the one region the server leaves empty: it is a rich-text view that exists
	 * only in a browser, and what it opens on may be the buffer, which only the browser has. So it
	 * mounts after hydration, and until then everything around it is already there.
	 */
	let mounted = $state(false);
	onMount(() => (mounted = true));

	// The row is what was saved; the buffer is what was typed after that. The later of the two
	// wins, and the page says so rather than resolving it silently.
	const buffered = $derived(mounted ? recall(rid) : undefined);
	let body = $derived(buffered ?? data.draft.body);
	let said = $derived(
		buffered !== undefined && buffered !== data.draft.body ? 'Recovered unsaved text.' : undefined,
	);

	function typed(value: string) {
		body = value;
		remember(rid, value);
	}

	// A blank field is a field nobody has filled in, so it travels as absent rather than as an
	// empty string -- which is a value, and which the collection would otherwise have to guess at.
	const said_ = (value: string) => (value.trim() === '' ? undefined : value.trim());

	// Every field the draft carries goes back with every save: the row's metadata is replaced
	// whole, so a field left out here would be a field a save erased.
	async function save() {
		const held = await saveDraft(rid, body, {
			title: said_(title),
			subtitle: said_(subtitle),
			description: said_(description),
			path: said_(category && slug ? `${category}/${slug}` : slug),
			language: said_(language),
		});
		forget(rid);
		said = `Saved ${held.updated.slice(11, 19)}`;
		// The sidebar names the article by its title and orders it by this save.
		await invalidate(DRAFTS);
	}

	// The preview reads the row, so what it shows is what was just written only once it is saved.
	// It opens in a tab of its own, so the editor stays where it was. The tab is opened inside the
	// click and pointed at the preview once the save lands: a window opened after an await is no
	// longer the click's, and the browser blocks it. See preview/[rid]/+page.svelte.
	function look() {
		const tab = window.open('about:blank', '_blank');
		void save()
			.then(() => {
				if (tab) tab.location.href = `/preview/${rid}`;
			})
			.catch(() => tab?.close());
	}

	async function publish() {
		await save();
		const done: Publication = await publishDraft(rid);
		missing = done.published ? [] : (done.missing ?? []);
		said = done.published ? `Published as revision ${done.seq}` : done.detail;
		// A refusal is said on the button that was refused, and the fields it names are marked in the
		// drawer for when it is brought out.
		if (done.published) revisions = await listRevisions(rid);
	}

	const styles = stylex.create({
		// The lifted sidebar's own ground, corner and shadow -- `sidebarStyles` in $lib/sidebar.ts --
		// so the two panels that come out of the window's edges are one kind of thing.
		sheet: {
			backgroundColor: 'var(--color-paper-hover)',
			borderRadius: radius.xl,
			boxShadow: '0 0.5rem 2rem oklch(0 0 0 / 0.18), 0 0 0 1px var(--color-border)',
		},
		quiet: { color: 'var(--color-text-soft)' },
		missing: { color: 'var(--color-red)' },
		heading: { color: 'var(--color-text-strong)' },
		rid: { color: 'var(--color-text-muted)', fontFamily: family.monoTheme, fontSize: text.px13 },
		label: { color: 'var(--color-text-soft)', fontSize: text.px13 },
		field: {
			color: 'var(--color-text)',
			borderBottomWidth: border.hairlinePx,
			borderBottomStyle: 'solid',
			borderBottomColor: { default: 'var(--color-border)', ':focus': 'var(--color-border-strong)' },
			'::placeholder': { color: 'var(--color-text-soft)' },
		},
		absent: {
			borderBottomColor: { default: 'var(--color-red)', ':focus': 'var(--color-red)' },
		},
		revision: { color: 'var(--color-text-muted)', fontVariantNumeric: figures.tabular },
		code: { fontFamily: family.monoTheme, fontSize: text.px13 },
	});

	/** A field's class, marked when a refused publication named it as missing. */
	const field = (key: string) =>
		`w-full bg-transparent py-1 outline-none ${stylex.attrs(styles.field, missing.includes(key) && styles.absent).class}`;

	useChrome({ toolbar, drawer });
</script>

<svelte:document onpointermove={edge} />

<!-- An icon alone: the label is what a screen reader says and what the pointer is told on hover. -->
{#snippet action(label: string, Icon: Component, run: () => void, refused = false)}
	<button
		type="button"
		onclick={run}
		aria-label={label}
		title={label}
		class="cursor-pointer p-1.5 {stylex.attrs(
			surfaces.quietControl,
			floating.control,
			refused && styles.missing,
		).class}"
	>
		<Icon class="size-4" aria-hidden="true" />
	</button>
{/snippet}

<!-- A native menu under the field's own line, with the chevron that says it opens. -->
{#snippet menu(
	value: string,
	choose: (value: string) => void,
	options: { value: string; label: string }[],
	key: string,
)}
	<span class="relative flex items-center">
		<select
			{value}
			onchange={(event) => choose(event.currentTarget.value)}
			class="cursor-pointer appearance-none pe-6 {field(key)}"
		>
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		<ChevronDown
			class="pointer-events-none absolute end-0 size-4 {stylex.attrs(styles.quiet).class}"
			aria-hidden="true"
		/>
	</span>
{/snippet}

{#snippet toolbar()}
	<div class="flex items-center gap-0.5 p-1 {stylex.attrs(floating.pill).class}">
		<!-- Placeholders, to see the toolbar with its eventual set: none is wired yet, and the two
		     with a pair of icons only swap between them. Preview, save and publish are off it
		     meanwhile. -->
		{@render action('Filter', Funnel, () => {})}
		{@render action('Read', BookOpen, () => {})}
		{@render action(
			toggled ? 'Toggle off' : 'Toggle on',
			toggled ? ToggleRight : ToggleLeft,
			() => {
				toggled = !toggled;
			},
		)}
		{@render action('Add a layer', LayersPlus, () => {})}
		{@render action(flagged ? 'Unflag' : 'Flag', flagged ? FlagOff : Flag, () => {
			flagged = !flagged;
		})}
		{@render action('Bring forward', LayerArrowUp, () => {})}
		{@render action('Settings', Settings2, () => {})}
	</div>
{/snippet}

{#snippet drawer()}
	{#if details === 'open'}
		<!-- The whole height of the window, beside its edge, as the lifted sidebar stands at the
		     other one -- a little wider, for fields rather than a list. -->
		<aside
			bind:this={drawerElement}
			aria-label="Details"
			class="fixed top-2 right-2 bottom-2 z-30 flex w-68 max-w-[calc(100vw-1rem)] flex-col gap-5 overflow-y-auto p-4 [scrollbar-width:none] {stylex.attrs(
				surfaces.uiText,
				styles.sheet,
			).class}"
		>
			<header class="flex items-center gap-2">
				<h2 class={stylex.attrs(styles.heading).class}>Details</h2>
				<span class={stylex.attrs(styles.rid).class}>{rid}</span>
			</header>

			<!-- Where the last save and a refused publication are said, for now: a place kept until
			     it is decided where this belongs. -->
			{#if missing.length > 0}
				<p class={stylex.attrs(styles.missing).class}>Missing: {missing.join(', ')}</p>
			{:else if said}
				<p class={stylex.attrs(styles.quiet).class}>{said}</p>
			{/if}

			<div class="flex flex-col gap-4">
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Title</span>
					<input bind:value={title} placeholder="Untitled" class={field('title')} />
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Short title</span>
					<input
						bind:value={shortTitle}
						placeholder="What a phone card shows"
						class={field('short_title')}
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Subtitle</span>
					<input
						bind:value={subtitle}
						placeholder="A line under the title"
						class={field('subtitle')}
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Short subtitle</span>
					<input
						bind:value={shortSubtitle}
						placeholder="The subtitle, shorter"
						class={field('short_subtitle')}
					/>
				</label>
				<!-- The category is chosen from those the corpus uses, or written: a new one is only this
				     draft's until it is saved, and after that every draft's list has it. -->
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Category</span>
					{#if naming}
						<input
							bind:value={category}
							placeholder="a-new-category"
							class="{field('path')} {stylex.attrs(styles.code).class}"
						/>
					{:else}
						{@render menu(
							category,
							(value) => {
								if (value === NEW_CATEGORY) {
									naming = true;
									category = '';
								} else category = value;
							},
							[
								{ value: '', label: 'None' },
								...categories.map((name) => ({ value: name, label: name })),
								{ value: NEW_CATEGORY, label: 'New category…' },
							],
							'path',
						)}
					{/if}
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Slug</span>
					<input
						bind:value={slug}
						placeholder="some-slug"
						class="{field('path')} {stylex.attrs(styles.code).class}"
					/>
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Language</span>
					{@render menu(
						language,
						(value) => (language = value),
						[
							...(LANGUAGES.some((known) => known.code === language)
								? []
								: [{ value: language, label: language || 'None' }]),
							...LANGUAGES.map((known) => ({ value: known.code, label: known.name })),
						],
						'language',
					)}
				</label>
				<label class="flex flex-col gap-1">
					<span class={stylex.attrs(styles.label).class}>Description</span>
					<textarea
						bind:value={description}
						rows="3"
						placeholder="What the article is about, for search and sharing"
						class="resize-none {field('description')}"></textarea>
				</label>
			</div>

			{#if revisions.length > 0}
				<section class="flex flex-col gap-1">
					<h3 class={stylex.attrs(styles.label).class}>Revisions</h3>
					<ul>
						{#each revisions as revision (revision.seq)}
							<li class="py-0.5 {stylex.attrs(styles.revision).class}">
								{revision.seq} · {revision.at.slice(0, 10)}{revision.atLocked ? ' · locked' : ''}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</aside>
	{/if}
{/snippet}

<!-- Mounted in the browser only, and remounted per article: the editor reads its text once,
     when it opens, so a second article has to be a second editor. The height is held so the
     region does not arrive by pushing anything down. -->
<div class="mx-auto min-h-96 max-w-(--rail-column) px-6">
	{#if mounted}
		<!-- The text editor replaces this one step by step, and is opened by asking for it until it
		     can. See spec/architecture/local.md, "The editor's document is the markdown text". -->
		{#key rid}
			{#if page.url.searchParams.get('editor') === 'text'}
				<TextEditor markdown={body} {language} onChange={typed} />
			{:else}
				<Editor markdown={body} {language} onChange={typed} />
			{/if}
		{/key}
	{/if}
</div>
