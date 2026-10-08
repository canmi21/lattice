<script lang="ts">
	/**
	 * What is deploying now, a stage per node, and the latest failures with where and why: a run's
	 * under it, linking to the run, and what no run started under its node, linking to the node's
	 * events. Seeded by the load and kept by the live store, each step `keep` keeps; see ./moving.ts.
	 */
	import * as stylex from '@stylexjs/stylex';
	import AppName from '../apps/app-name.svelte';
	import { ago, localTime } from '../format.ts';
	import NodeName from '../nodes/node-name.svelte';
	import type { Live } from '../live.svelte.ts';
	import { scoped } from '../scope/context.ts';
	import { surfaces, type } from '../style.ts';
	import Badge from '../ui/badge.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import { current, fromLive, type Group, type Step, what } from './moving.ts';

	let {
		live,
		seed,
		keep = () => true,
	}: { live: Live; seed: Step[]; keep?: (app: string) => boolean } = $props();

	const { to, node: toNode } = scoped();

	const zone = timeZone();
	const now = $derived(
		current(
			seed,
			fromLive(live.view.nodes).filter((step) => keep(step.app)),
		),
	);
	const when = (step: Step) => step.finished_at ?? step.started_at;
	const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
	/** A run's page, or the node's events for what no run started. */
	const hrefOf = (step: Pick<Step, 'run' | 'node'>) =>
		step.run === undefined ? `${toNode(step.node)}?tab=events` : to(`/deployments/${step.run}`);
	/** Its stage; a run's step before its first is starting, and an act with none in progress. */
	const stageOf = (step: Step) =>
		step.stage ? capital(step.stage) : step.run === undefined ? 'In progress' : 'Starting';
	const keyOf = (step: Step) => `${step.run ?? step.source}/${step.node}/${step.app}`;
</script>

{#snippet heading(group: Group)}
	{#if group.run === undefined}
		<span class={stylex.attrs(type.name).class}><NodeName code={group.node ?? ''} /></span>
	{:else}
		<span class={stylex.attrs(type.name).class}>Run {group.run}</span>
	{/if}
{/snippet}

<div class="flex flex-col gap-5">
	<section class="flex flex-col gap-2">
		<h3 class={stylex.attrs(type.label).class}>Deploying</h3>
		{#each now.running as group (group.key)}
			<a
				href={hrefOf({ run: group.run, node: group.node ?? '' })}
				class="flex flex-col gap-1.5 p-3 {stylex.attrs(surfaces.well).class}"
			>
				{@render heading(group)}
				<ul class="flex flex-col gap-1">
					{#each group.steps as step (keyOf(step))}
						<li class="flex items-center justify-between gap-2">
							<span class="truncate {stylex.attrs(type.body).class}">
								<AppName app={step.app} />
								<span class={stylex.attrs(type.soft).class}
									>{#if step.run === undefined}{what(step)}{:else}<NodeName
											code={step.node}
											short
										/>{/if}</span
								>
							</span>
							<Badge tone="busy">{stageOf(step)}</Badge>
						</li>
					{/each}
				</ul>
			</a>
		{:else}
			<p class={stylex.attrs(type.soft).class}>Nothing is deploying.</p>
		{/each}
	</section>

	<section class="flex flex-col gap-2">
		<h3 class={stylex.attrs(type.label).class}>Latest failures</h3>
		<ul class="flex flex-col">
			{#each now.failed as step (keyOf(step))}
				<li class="py-2 {stylex.attrs(surfaces.listRule).class}">
					<a href={hrefOf(step)} class="flex flex-col gap-1">
						<span class="flex items-center justify-between gap-2">
							<span class="truncate {stylex.attrs(type.body).class}">
								<AppName app={step.app} />
								<span class={stylex.attrs(type.soft).class}
									><NodeName code={step.node} short /></span
								>
							</span>
							<Badge tone="bad">{step.stage ? `Failed while ${step.stage}` : 'Failed'}</Badge>
						</span>
						{#if step.detail}
							<span class="line-clamp-2 {stylex.attrs(type.soft).class}" title={step.detail}>
								{step.detail}
							</span>
						{/if}
						<span class={stylex.attrs(type.soft).class} title={localTime(when(step), zone)}>
							{step.run === undefined ? what(step) : `Run ${step.run}`}, {ago(when(step), live.now)}
						</span>
					</a>
				</li>
			{:else}
				<li class={stylex.attrs(type.soft).class}>No recent failures.</li>
			{/each}
		</ul>
	</section>
</div>
