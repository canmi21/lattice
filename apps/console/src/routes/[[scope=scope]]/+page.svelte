<script lang="ts">
	/**
	 * The view at a glance, in three parts: whether anything is wrong, the whole of it on the map
	 * with its figures under it, and what happened last beside what failed. Charts are the pages'
	 * that own them, Deployments' and Nodes'. See spec/console/overview.md.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import Card from '#lib/card.svelte';
	import { live as liveOf } from '#lib/live.svelte.js';
	import { HEIGHT, WIDTH } from '#lib/map/land.generated.js';
	import WorldMap from '#lib/map/world-map.svelte';
	import Heard from '#lib/nodes/heard.svelte';
	import Activity from '#lib/overview/activity.svelte';
	import Figures from '#lib/overview/figures.svelte';
	import NodeList from '#lib/overview/node-list.svelte';
	import { current, fromLive, lines } from '#lib/overview/moving.js';
	import Stopped from '#lib/overview/stopped.svelte';
	import Verdict from '#lib/overview/verdict.svelte';
	import Empty from '#lib/scope/empty.svelte';
	import { scoped } from '#lib/scope/context.js';
	import { shows } from '#lib/scope/scope.js';
	import { surfaces } from '#lib/style.js';
	import { Landed } from '#lib/ui/landed.svelte.js';
	import PageHeader from '#lib/ui/page-header.svelte';
	import Segmented from '#lib/ui/segmented.svelte';
	import Silent from '#lib/ui/silent.svelte';
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
	/** Everything, going, failed and finished, a line a run, newest first. */
	const recent = $derived(
		now ? lines([...now.running.flatMap((group) => group.steps), ...now.failed, ...now.done]) : [],
	);
	/** What failed in the last week, a line a run; older is the deployments page's. */
	const WEEK = 7 * 86_400_000;
	const failed = $derived(
		now ? lines(now.failed).filter((line) => live.now - Date.parse(line.at) < WEEK) : [],
	);

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
	/** Which of the deployments the card lists. */
	let showing: 'all' | 'failed' = $state('all');

	const styles = stylex.create({
		more: {
			color: { default: 'var(--color-text-muted)', ':hover': 'var(--color-text-strong)' },
			fontSize: text.px13,
			transitionProperty: 'color',
			transitionDuration: duration.base,
		},
	});

	/** A step's row and the list's own padding, before the runs land. */
	const LIST = 10 * 28;
	/** The node the database is primary on, once read; each card's latency is to it. */
	const primary = new Landed(
		() => data.primary,
		() => data.view,
	);
	/** The node a line of the list points at, which the map opens. */
	let pointed: string | undefined = $state();
</script>

{#snippet lists()}
	<div class="grid gap-4 xl:grid-cols-2">
		<Card title="Deployments" flush>
			{#snippet aside()}
				<div class="flex items-center gap-3">
					<Segmented
						label="Which deployments"
						bind:value={showing}
						options={[
							{ key: 'all', label: 'All' },
							{ key: 'failed', label: failed.length ? `Failed ${failed.length}` : 'Failed' },
						]}
					/>
					<a href={to('/deployments')} class={stylex.attrs(styles.more).class}>View all</a>
				</div>
			{/snippet}
			<!-- As tall as its ten lines whichever is shown, so switching moves nothing below. -->
			<div class="flex flex-col px-3 pb-3" style:min-height="{LIST}px">
				{#if !now}
					<Skeleton height={LIST} />
				{:else if showing === 'all'}
					<Activity
						lines={recent}
						now={live.now}
						label="Every deployment, newest first"
						empty="Nothing has deployed yet"
					/>
				{:else}
					<Activity
						lines={failed}
						now={live.now}
						label="What failed this week, newest first"
						empty="No failures this week"
					/>
				{/if}
			</div>
		</Card>
		<Card title="Not running" flush>
			{#snippet aside()}
				<!-- As tall as the switch beside the other card's title, so the two titles line up. -->
				<a href={to('/apps')} class="flex h-[33px] items-center {stylex.attrs(styles.more).class}"
					>View all</a
				>
			{/snippet}
			<div class="flex flex-col px-3 pb-3" style:min-height="{LIST}px">
				<Heard {live} cluster={data.cluster}>
					<Stopped {live} {keep} />
					{#snippet pending()}<Skeleton height={LIST} />{/snippet}
				</Heard>
			</div>
		</Card>
	</div>
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
					/>
					{#snippet pending()}
						<div class="mx-auto" style:max-width="calc(26.25rem * {WIDTH} / {HEIGHT})">
							<Skeleton ratio="{WIDTH} / {HEIGHT}" />
						</div>
					{/snippet}
				</Heard>
			</div>
		</div>
		<div class={stylex.attrs(surfaces.rowRule).class}>
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
				<Figures {live} deploys={data.deploys} {keep} nodes={false} />
			</section>
			{@render lists()}
		{:else}
			<Empty view={data.view} />
		{/if}
	{/await}
{/if}
