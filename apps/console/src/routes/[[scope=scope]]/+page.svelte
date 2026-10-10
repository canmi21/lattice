<script lang="ts">
	/**
	 * The view at a glance, in three parts: whether anything is wrong, the whole of it on the map
	 * with its figures under it, and the last day, a line a node. Charts are the pages' that own
	 * them, Deployments' and Nodes'. See spec/console/overview.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { border, radius } from '@canmi/kit/tokens/vocabulary.stylex';
	import Card from '#lib/card.svelte';
	import { live as liveOf } from '#lib/live.svelte.js';
	import { HEIGHT, WIDTH } from '#lib/map/land.generated.js';
	import WorldMap from '#lib/map/world-map.svelte';
	import Heard from '#lib/nodes/heard.svelte';
	import Figures from '#lib/overview/figures.svelte';
	import NodeList from '#lib/overview/node-list.svelte';
	import { current, fromLive, merged } from '#lib/overview/moving.js';
	import Timeline from '#lib/overview/timeline.svelte';
	import TimelineLegend from '#lib/overview/timeline-legend.svelte';
	import { SPANS, SPAN_GROUPS, type Span } from '#lib/overview/timeline.js';
	import TitleChoice from '#lib/ui/title-choice.svelte';
	import Verdict from '#lib/overview/verdict.svelte';
	import Empty from '#lib/scope/empty.svelte';
	import { scoped } from '#lib/scope/context.js';
	import { shows } from '#lib/scope/scope.js';
	import { surfaces } from '#lib/style.js';
	import { Landed } from '#lib/ui/landed.svelte.js';
	import PageHeader from '#lib/ui/page-header.svelte';
	import Silent from '#lib/ui/silent.svelte';
	import { DIMENSIONS, type Dimension } from '#lib/overview/history.js';
	import { Histories } from '#lib/overview/histories.svelte.js';
	import { prefer } from '#lib/ui/preference.js';
	import Skeleton from '#lib/ui/skeleton.svelte';
	import Unread from '#lib/unread.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const live = liveOf();
	const keep = (app: string) => shows(data.view, app);

	/** The runs' steps once they land, overtaken by the live store's as the nodes report. */
	const seed = new Landed(
		() => data.moving,
		() => data.view,
	);
	const now = $derived(
		seed.value &&
			current(
				seed.value,
				fromLive(live.view.nodes).filter((step) => keep(step.app)),
			),
	);
	/** Every step known, the day's history and the live store's, which the timeline draws. */
	const day = $derived(seed.value ? merged(seed.value, fromLive(live.view.nodes)) : []);

	/** Whether the view holds anything: a run, or an app on a node; unknown counts as yes. */
	const holds = (read: Awaited<typeof data.cluster>, deploys: Awaited<typeof data.deploys>) =>
		deploys.seen > 0 ||
		!read.ok ||
		Object.values(read.data.nodes).some((one) => one.snapshot?.apps.some((app) => keep(app.name)));
	/** As soon as both are read: at once where the load held them, as it does for the first. */
	const held = $derived(
		data.cluster instanceof Promise || data.deploys instanceof Promise
			? Promise.all([data.cluster, data.deploys]).then(([read, deploys]) => holds(read, deploys))
			: holds(data.cluster, data.deploys),
	);
	const { to } = scoped();

	/** The card's corner inside its hairline, which what fills the card to its edge is cut to. */
	const INSIDE = `calc(${radius.xl} - ${border.hairlinePx})`;
	const styles = stylex.create({
		foot: { overflow: 'hidden', borderBottomLeftRadius: INSIDE, borderBottomRightRadius: INSIDE },
		whole: { overflow: 'hidden', borderRadius: INSIDE },
	});
	/** How far back the timeline reaches: the reader's last choice, a week until they make one. */
	// svelte-ignore state_referenced_locally
	let back: Span = $state(data.back);
	$effect(() => prefer('span', back));
	/** What the timeline's slots are the verdict of: the overview of all three until chosen. */
	// svelte-ignore state_referenced_locally
	let dimension: Dimension = $state(data.dimension);
	$effect(() => prefer('dimension', dimension));
	/** A view without nodes has no node to hear, so it is not asked about connectivity. */
	const asking = $derived([
		{
			name: 'What',
			options: DIMENSIONS.filter((one) => data.nodes || one.key !== 'connectivity'),
		},
	]);
	const histories = new Histories(() => ({ key: data.back, history: data.minutes }));
	$effect(() => {
		if (histories.current?.key !== back) void histories.ask(back);
	});

	/** The place list's and the timeline's height before their reads land. */
	const LIST = 9 * 28;
	/** The node the database is primary on, once read; each card's latency is to it. */
	const primary = new Landed(
		() => data.primary,
		() => data.view,
	);
	/** The node a line of the list points at, which the map opens. */
	let pointed: string | undefined = $state();
</script>

{#snippet lists()}
	<Card
		title="{DIMENSIONS.find((one) => one.key === dimension)?.title}, {SPANS.find(
			(one) => one.key === back,
		)?.title}"
		flush
	>
		{#snippet heading()}
			<span class="flex items-center gap-2">
				<TitleChoice label="What the timeline shows" bind:value={dimension} groups={asking} />
				<TitleChoice
					label="How far back"
					bind:value={back}
					links={[{ title: 'View all deployments', href: to('/deployments') }]}
					groups={SPAN_GROUPS}
				/>
			</span>
		{/snippet}
		{#snippet aside()}<TimelineLegend {dimension} />{/snippet}
		<!-- Its last row as far from the card's foot as its words are from the sides. -->
		<div class="px-5 pb-4.5">
			{#if seed.value}
				<Timeline
					{live}
					steps={day}
					{keep}
					nodes={data.nodes}
					{back}
					bind:dimension
					history={histories.current?.history}
				/>
			{:else}
				<Skeleton height={LIST} />
			{/if}
		</div>
	</Card>
{/snippet}

<PageHeader title="Overview" />

{#await data.deploys then { missing }}<Silent nodes={missing} />{/await}

{#await data.cluster then read}
	{#if !read.ok}<Unread what="The cluster" failure={read.failure} />{/if}
{/await}

<!-- The nodes are All's and Infra's; see spec/architecture/console.md. -->
{#if data.nodes}
	<Verdict {live} {now} {keep} />
	<section class="flex min-w-0 flex-col {stylex.attrs(surfaces.card).class}">
		<h2 class="sr-only">Nodes</h2>
		<div class="grid gap-6 p-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
			<Heard {live} cluster={data.cluster}>
				<NodeList {live} bind:pointed />
				{#snippet pending()}<Skeleton height={LIST} />{/snippet}
			</Heard>
			<!-- No taller than 26.25rem, its shape kept and the room either side left empty; see
			     spec/console/overview.md, "The map is the page's whole picture". -->
			<div class="min-w-0">
				<Heard {live} cluster={data.cluster}>
					<WorldMap
						states={live.view.nodes}
						now={live.now}
						{pointed}
						tallest="26.25rem"
						primary={primary.value}
						shape={data.shape}
					/>
					{#snippet pending()}
						<div class="mx-auto" style:max-width="calc(26.25rem * {WIDTH} / {HEIGHT})">
							<Skeleton ratio="{WIDTH} / {HEIGHT}" />
						</div>
					{/snippet}
				</Heard>
			</div>
		</div>
		<!-- Clipped to the card's inner corners, which the rules between the figures would cross. -->
		<div class={stylex.attrs(surfaces.rowRule, styles.foot).class}>
			<Figures {live} deploys={data.deploys} {keep} />
		</div>
	</section>
	{@render lists()}
{:else}
	<!-- The empty state's own height, as either may follow. -->
	{#await held}
		<Skeleton height={192} />
	{:then any}
		{#if any}
			<Verdict {live} {now} {keep} nodes={false} />
			<section class={stylex.attrs(surfaces.card).class}>
				<div class={stylex.attrs(styles.whole).class}>
					<Figures {live} deploys={data.deploys} {keep} nodes={false} />
				</div>
			</section>
			{@render lists()}
		{:else}
			<Empty view={data.view} />
		{/if}
	{/await}
{/if}
