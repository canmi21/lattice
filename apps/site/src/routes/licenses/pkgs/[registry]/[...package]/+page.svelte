<script module lang="ts">
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import {
		border,
		duration,
		easing,
		family,
		line,
		radius,
		text,
		transition,
	} from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the package page. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css.md.
	 *
	 * Two of Tailwind's own theme variables are read differently and the difference is whether
	 * anything outside a utility names them. `--font-mono` is also read by `.value-cell` in
	 * app.css, so it survives however many `font-mono` classes leave the markup; `--leading-relaxed`
	 * is named by nothing but its own utility, so its value is written out here instead.
	 */
	const styles = stylex.create({
		breadcrumb: {
			fontSize: text.px15,
			color: 'var(--color-text-soft)',
		},
		breadcrumbLink: {
			// No colour at rest: the trail sets one on itself and each crumb inherits it, so only
			// the two states name a colour of their own.
			color: {
				default: null,
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the colour from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
			transitionProperty: transition.colors,
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
		name: {
			color: 'var(--color-text-strong)',
			overflowWrap: 'break-word',
		},
		version: {
			fontFamily: family.monoTheme,
			fontSize: text.px15,
			color: 'var(--color-text-soft)',
		},
		summary: {
			lineHeight: line.relaxed,
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
		noticeLink: {
			fontSize: text.px15,
		},
		records: {
			fontSize: text.px15,
		},
		label: {
			color: 'var(--color-text-soft)',
		},
		avatar: {
			// The clamp to half the box is the browser's, so the radius is stated as the
			// unbounded length Tailwind's `rounded-full` is rather than as a number.
			borderRadius: radius.full,
			backgroundColor: 'var(--color-paper)',
		},
		spdx: {
			fontFamily: family.monoTheme,
			overflowWrap: 'break-word',
			color: 'var(--color-text-strong)',
		},
		spdxTerms: {
			fontSize: text.px13,
			color: 'var(--color-text-soft)',
		},
		spdxTerm: {
			fontFamily: family.monoTheme,
		},
		assertedNote: {
			fontSize: text.px13,
			lineHeight: line.relaxed,
			textWrap: 'pretty',
			color: 'var(--color-text-soft)',
		},
		handle: {
			color: 'var(--color-text-soft)',
		},
		authorName: {
			color: 'var(--color-text-strong)',
		},
		fileLink: {
			fontFamily: family.monoTheme,
			fontSize: text.px13,
		},
		noFiles: {
			color: 'var(--color-text-soft)',
		},
		chainMarker: {
			// The bullet and the line dropping from it to the next one. Where each sits and how
			// large it is stays in the markup, which is also what still gives them their
			// `content`; this is the half that says what they look like.
			'::before': {
				borderRadius: radius.full,
				borderWidth: border.hairlinePx,
				borderStyle: 'solid',
				borderColor: 'var(--color-border-strong)',
				backgroundColor: 'var(--color-page)',
			},
			'::after': {
				borderLeftWidth: border.hairlinePx,
				borderLeftStyle: 'solid',
				borderColor: 'var(--color-border-strong)',
			},
		},
		chainLink: {
			color: {
				default: 'var(--color-text-strong)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-soft)' },
				':focus-visible': 'var(--color-text-soft)',
			},
			transitionProperty: transition.colors,
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
		chainName: {
			color: 'var(--color-text-strong)',
		},
		nodeVersion: {
			fontFamily: family.monoTheme,
			fontSize: text.px12,
			color: 'var(--color-text-soft)',
		},
		nodeTag: {
			fontSize: text.px12,
			color: 'var(--color-text-soft)',
		},
		groupLabel: {
			fontSize: text.px13,
			color: 'var(--color-text-soft)',
		},
		// A dependent's name wraps where a chain's truncates, so the two links differ by one
		// declaration and are written out rather than composed: merging a second style over the
		// first would reach the resting colour and leave its two states behind.
		dependentLink: {
			color: {
				default: 'var(--color-text-strong)',
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-soft)' },
				':focus-visible': 'var(--color-text-soft)',
			},
			overflowWrap: 'break-word',
			transitionProperty: transition.colors,
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
		dependentName: {
			color: 'var(--color-text-strong)',
			overflowWrap: 'break-word',
		},
	});
</script>

<script lang="ts">
	import { dev } from '$app/environment';
	import { pageUrls, URLS } from '@canmi/urls';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileText from '@lucide/svelte/icons/file-text';
	import { localeUrl } from '$lib/locale';
	import LanguageSwitcher from '$lib/locale/switcher.svelte';
	import { githubAvatar, textUrl } from '$lib/licenses';
	import { CARD_HEIGHT, CARD_WIDTH, cardUrl } from '$lib/opengraph';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const locale = $derived(data.locale.code);
	const cdn = pageUrls(dev).cdn;
	const title = $derived(data.coordinates.name);
	const description = $derived(
		data.entry.description ??
			m['licenses.package_description'](
				{ name: data.coordinates.name, version: data.coordinates.version },
				{ locale },
			),
	);
	const slug = $derived(
		`licenses/pkgs/${data.coordinates.registry}/${data.coordinates.name}@${data.coordinates.version}`,
	);
	const canonical = $derived(localeUrl(`${URLS.apps.production.site}/${slug}`, locale));
	const card = $derived(cardUrl(cdn, slug, locale));

	// A single licence whose identifier is the whole SPDX expression renders as one link; a
	// compound expression keeps the plain expression with separate links to its terms.
	const soleLicense = $derived(
		data.licenses.length === 1 && data.licenses[0]?.license === data.entry.spdx
			? data.licenses[0]
			: undefined,
	);

	// A package reached only as a direct dependency has no indirect half, and a heading over an
	// empty list would read as a missing answer rather than as nothing to say.
	const dependents = $derived(
		[
			{
				key: 'direct',
				label: m['licenses.dependents_direct']({}, { locale }),
				nodes: data.dependents.direct,
			},
			{
				key: 'indirect',
				label: m['licenses.dependents_indirect']({}, { locale }),
				nodes: data.dependents.indirect,
			},
		].filter((group) => group.nodes.length > 0),
	);
</script>

<svelte:head>
	<title>{title} {data.coordinates.version} · {m['licenses.title']({}, { locale })}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={card} />
	<meta property="og:image:width" content={CARD_WIDTH} />
	<meta property="og:image:height" content={CARD_HEIGHT} />
	<meta property="og:image:alt" content={title} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="min-h-screen {stylex.attrs(surfaces.page).class}">
	<article class="mx-auto max-w-180 px-6 py-24">
		<nav
			aria-label={m['licenses.breadcrumb']({}, { locale })}
			class="flex min-w-0 flex-wrap items-center gap-x-2 {stylex.attrs(styles.breadcrumb).class}"
		>
			<a href="/licenses" class="focus-link {stylex.attrs(styles.breadcrumbLink).class}"
				>{m['licenses.all_licenses']({}, { locale })}</a
			>
			<span aria-hidden="true">/</span>
			<a href="/licenses/pkgs" class="focus-link {stylex.attrs(styles.breadcrumbLink).class}"
				>{m['licenses.packages']({}, { locale })}</a
			>
			<span aria-hidden="true">/</span>
			<a
				href={data.registry.directoryHref}
				class="focus-link {stylex.attrs(styles.breadcrumbLink).class}">{data.registry.name}</a
			>
		</nav>

		<header class="mt-8">
			<div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
				<h1 class="min-w-0 {stylex.attrs(styles.name).class}">{data.coordinates.name}</h1>
				<span class={stylex.attrs(styles.version).class}>{data.coordinates.version}</span>
			</div>
			{#if data.entry.description}
				<p class="mt-4 {stylex.attrs(styles.summary).class}">{data.entry.description}</p>
			{/if}
			<nav aria-label={m['licenses.actions']({}, { locale })} class="mt-4 flex flex-wrap gap-4">
				<a
					href={data.textHref}
					data-sveltekit-reload
					class="-mx-1 inline-flex items-center px-1 py-0.5 {stylex.attrs(
						surfaces.quietControl,
						styles.noticeLink,
					).class}"
				>
					<span class="focus-link-inner inline-flex items-center gap-1.5">
						<FileText class="size-3.5" aria-hidden="true" />
						<span>{m['licenses.package_notice']({}, { locale })}</span>
					</span>
				</a>
				<LanguageSwitcher code={locale} />
			</nav>
		</header>

		<!--
			One grid across both sections, so the label column is measured against every label on the
			page at once. A fixed width cannot hold: `Documentación` is 111px against the 104px this
			used to be, and `Archivos de licencia` wants 142px, so five of the nine locales either
			spilled into the gutter or wrapped to a second line. Sizing each list on its own would fix
			that and leave the two sections disagreeing about where their values start, by up to 45px
			in Japanese. Subgrid is what lets the column be intrinsic and shared at the same time.
		-->
		<div class="mt-16 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4">
			<section aria-labelledby="package-metadata" class="col-span-2 grid grid-cols-subgrid">
				<h2 id="package-metadata" class="col-span-2 mb-4 {stylex.attrs(surfaces.heading).class}">
					{m['licenses.package']({}, { locale })}
				</h2>
				<dl class="col-span-2 grid grid-cols-subgrid gap-y-3 {stylex.attrs(styles.records).class}">
					<dt class={stylex.attrs(styles.label).class}>{m['licenses.registry']({}, { locale })}</dt>
					<dd class="min-w-0">
						<a
							href={data.registry.packageHref}
							target="_blank"
							rel="noopener"
							class="focus-link spring-underline article-link inline-flex max-w-full items-center gap-1.5"
						>
							<span class="truncate">{data.registry.name}</span>
							<ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
						</a>
					</dd>
					{#if data.repository.href}
						<dt class={stylex.attrs(styles.label).class}>
							{m['licenses.repository_label']({}, { locale })}
						</dt>
						<dd class="min-w-0">
							{#if data.repository.github}
								<span class="inline-flex min-w-0 items-center gap-2">
									<img
										src={githubAvatar(cdn, data.repository.github.owner, 48)}
										alt=""
										width="24"
										height="24"
										loading="lazy"
										class="size-6 shrink-0 {stylex.attrs(styles.avatar).class}"
									/>
									<span class="min-w-0 truncate">
										<a
											href="{data.githubHref}/{data.repository.github.owner}"
											target="_blank"
											rel="noopener"
											class="focus-link spring-underline article-link"
											>{data.repository.github.owner}</a
										>/<a
											href={data.repository.github.url}
											target="_blank"
											rel="noopener"
											class="focus-link spring-underline article-link"
											>{data.repository.github.name}</a
										>
									</span>
								</span>
							{:else}
								<a
									href={data.repository.href}
									target="_blank"
									rel="noopener"
									class="focus-link spring-underline article-link block w-fit max-w-full truncate"
									>{data.repository.href}</a
								>
							{/if}
						</dd>
					{/if}
					{#if data.entry.homepage}
						<dt class={stylex.attrs(styles.label).class}>
							{m['licenses.homepage']({}, { locale })}
						</dt>
						<dd class="min-w-0">
							<a
								href={data.entry.homepage}
								target="_blank"
								rel="noopener"
								class="focus-link spring-underline article-link block w-fit max-w-full truncate"
								>{data.entry.homepage}</a
							>
						</dd>
					{/if}
					{#if data.entry.documentation}
						<dt class={stylex.attrs(styles.label).class}>
							{m['licenses.documentation']({}, { locale })}
						</dt>
						<dd class="min-w-0">
							<a
								href={data.entry.documentation}
								target="_blank"
								rel="noopener"
								class="focus-link spring-underline article-link block w-fit max-w-full truncate"
								>{data.entry.documentation}</a
							>
						</dd>
					{/if}
				</dl>
			</section>

			<section aria-labelledby="package-terms" class="col-span-2 mt-12 grid grid-cols-subgrid">
				<h2 id="package-terms" class="col-span-2 mb-4 {stylex.attrs(surfaces.heading).class}">
					{m['licenses.terms_attribution']({}, { locale })}
				</h2>
				<dl class="col-span-2 grid grid-cols-subgrid gap-y-3 {stylex.attrs(styles.records).class}">
					<dt class={stylex.attrs(styles.label).class}>{m['licenses.license']({}, { locale })}</dt>
					<dd class="min-w-0">
						{#if soleLicense}
							<a
								href={soleLicense.href}
								class="focus-link spring-underline article-link {stylex.attrs(styles.spdx).class}"
								>{data.entry.spdx}</a
							>
						{:else}
							<p class={stylex.attrs(styles.spdx).class}>{data.entry.spdx}</p>
							<p class="mt-1 flex flex-wrap gap-x-3 gap-y-1 {stylex.attrs(styles.spdxTerms).class}">
								{#each data.licenses as license (license.license)}
									<a
										href={license.href}
										class="focus-link spring-underline article-link {stylex.attrs(styles.spdxTerm)
											.class}">{license.license}</a
									>
								{/each}
							</p>
						{/if}
						{#if data.entry.asserted}
							<p class="mt-2 {stylex.attrs(styles.assertedNote).class}">
								{m['licenses.asserted_note']({}, { locale })}
							</p>
						{/if}
					</dd>
					{#if data.entry.authors?.length}
						<dt class={stylex.attrs(styles.label).class}>
							{m['licenses.authors']({}, { locale })}
						</dt>
						<dd class="flex min-w-0 flex-wrap gap-x-5 gap-y-2">
							{#each data.entry.authors as author, index (`${author.name}:${author.github ?? ''}:${index}`)}
								<span class="inline-flex min-w-0 items-center gap-2">
									{#if author.github}
										<img
											src={githubAvatar(cdn, author.github, 48)}
											alt=""
											width="24"
											height="24"
											loading="lazy"
											class="size-6 shrink-0 {stylex.attrs(styles.avatar).class}"
										/>
										<a
											href="{data.githubHref}/{author.github}"
											target="_blank"
											rel="noopener"
											class="focus-link spring-underline article-link min-w-0 truncate"
											>{author.name}
											<span class={stylex.attrs(styles.handle).class}>@{author.github}</span></a
										>
									{:else}
										<span class="min-w-0 {stylex.attrs(styles.authorName).class}"
											>{author.name}</span
										>
									{/if}
								</span>
							{/each}
						</dd>
					{/if}
					<dt class={stylex.attrs(styles.label).class}>{m['licenses.files']({}, { locale })}</dt>
					<dd class="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
						{#if data.entry.texts?.length}
							{#each data.entry.texts as file (`${file.name}:${file.cid}`)}
								<a
									href={textUrl(cdn, file.cid)}
									target="_blank"
									rel="noopener"
									class="focus-link spring-underline article-link {stylex.attrs(styles.fileLink)
										.class}">{file.name}</a
								>
							{/each}
						{:else}
							<span class={stylex.attrs(styles.noFiles).class}
								>{m['licenses.no_files']({}, { locale })}</span
							>
						{/if}
					</dd>
				</dl>
			</section>
		</div>

		<section aria-labelledby="dependency-paths" class="mt-12">
			<h2 id="dependency-paths" class={stylex.attrs(surfaces.heading).class}>
				{m['licenses.dependency_paths']({}, { locale })}
			</h2>
			<!-- Always one column, however many roots there are. Each chain is read top to
			bottom, and a second column beside the first asks the eye to start over somewhere
			it has no reason to look. -->
			<div class="mt-5 flex flex-col gap-6">
				{#each data.origins as origin (origin.root)}
					{@const nodes = [
						{ id: `root:${origin.root}`, name: origin.root, version: '', href: '' },
						...origin.nodes,
					]}
					<ol aria-label={origin.root}>
						{#each nodes as node, index (node.id)}
							<li
								class="relative min-w-0 pb-3 pl-5 last:pb-0 before:absolute before:top-[0.4375rem] before:left-0 before:size-2 after:absolute after:top-[1rem] after:bottom-0 after:left-[0.21875rem] last:after:hidden {stylex.attrs(
									styles.chainMarker,
								).class}"
							>
								<div class="flex min-w-0 items-baseline gap-2">
									{#if node.href}
										<a
											href={node.href}
											class="focus-link min-w-0 truncate {stylex.attrs(styles.chainLink).class}"
											>{node.name}</a
										>
									{:else}
										<span class="min-w-0 truncate {stylex.attrs(styles.chainName).class}"
											>{node.name}</span
										>
									{/if}
									{#if node.version}
										<span class="shrink-0 {stylex.attrs(styles.nodeVersion).class}"
											>{node.version}</span
										>
									{:else if index === 0}
										<span class="shrink-0 {stylex.attrs(styles.nodeTag).class}"
											>{m['licenses.workspace_root']({}, { locale })}</span
										>
									{/if}
								</div>
							</li>
						{/each}
					</ol>
				{/each}
			</div>
		</section>

		{#if data.dependents.direct.length}
			<section aria-labelledby="dependents" class="mt-12">
				<h2 id="dependents" class={stylex.attrs(surfaces.heading).class}>
					{m['licenses.dependents']({}, { locale })}
				</h2>
				<div class="mt-5 flex flex-col gap-6">
					{#each dependents as group (group.key)}
						<div class="min-w-0">
							<h3 class={stylex.attrs(styles.groupLabel).class}>{group.label}</h3>
							<!-- One run that wraps, rather than columns. The group holds anywhere from
							one entry to over a hundred, and fixed columns serve neither end: three
							entries leave two columns empty and break a long name onto its own line,
							while a hundred in one strip is a column of scrolling. Wrapping fills
							whatever width there is and lets the count decide the height. -->
							<ul class="mt-3 flex flex-wrap gap-x-6 gap-y-2">
								{#each group.nodes as node (node.id)}
									<li class="flex min-w-0 items-baseline gap-2">
										{#if node.href}
											<a
												href={node.href}
												class="focus-link min-w-0 {stylex.attrs(styles.dependentLink).class}"
												>{node.name}</a
											>
										{:else}
											<span class="min-w-0 {stylex.attrs(styles.dependentName).class}"
												>{node.name}</span
											>
										{/if}
										{#if node.version}
											<span class="shrink-0 {stylex.attrs(styles.nodeVersion).class}"
												>{node.version}</span
											>
										{:else}
											<span class="shrink-0 {stylex.attrs(styles.nodeTag).class}"
												>{m['licenses.workspace_root']({}, { locale })}</span
											>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</article>
</main>
