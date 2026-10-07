<script lang="ts">
	/**
	 * What is deploying now, a stage per node, and the latest failures with where and why, each a
	 * link to its run. Seeded by the load and kept by the live store, each step `keep` keeps; see
	 * ./moving.ts.
	 */
	import * as stylex from '@stylexjs/stylex';
	import { ago, localTime } from '../format.ts';
	import type { Live } from '../live.svelte.ts';
	import { scoped } from '../scope/context.ts';
	import { surfaces, type } from '../style.ts';
	import Badge from '../ui/badge.svelte';
	import { timeZone } from '../ui/time-zone.ts';
	import { current, fromLive, type Step } from './moving.ts';

	let {
		live,
		seed,
		keep = () => true,
	}: { live: Live; seed: Step[]; keep?: (app: string) => boolean } = $props();

	const { to } = scoped();

	const zone = timeZone();
	const now = $derived(
		current(
			seed,
			fromLive(live.view.nodes).filter((step) => keep(step.app)),
		),
	);
	const when = (step: Step) => step.finished_at ?? step.started_at;
	const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
</script>

<div class="flex flex-col gap-5">
	<section class="flex flex-col gap-2">
		<h3 class={stylex.attrs(type.label).class}>Deploying</h3>
		{#each now.running as run (run.run)}
			<a
				href={to(`/deployments/${run.run}`)}
				class="flex flex-col gap-1.5 p-3 {stylex.attrs(surfaces.well).class}"
			>
				<span class={stylex.attrs(type.name).class}>Run {run.run}</span>
				<ul class="flex flex-col gap-1">
					{#each run.steps as step (`${step.node}/${step.app}`)}
						<li class="flex items-center justify-between gap-2">
							<span class="truncate {stylex.attrs(type.body).class}">
								{step.app} <span class={stylex.attrs(type.mono, type.soft).class}>{step.node}</span>
							</span>
							<Badge tone="busy">{capital(step.stage ?? 'starting')}</Badge>
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
			{#each now.failed as step (`${step.run}/${step.node}/${step.app}`)}
				<li class="py-2 {stylex.attrs(surfaces.listRule).class}">
					<a href={to(`/deployments/${step.run}`)} class="flex flex-col gap-1">
						<span class="flex items-center justify-between gap-2">
							<span class="truncate {stylex.attrs(type.body).class}">
								{step.app} <span class={stylex.attrs(type.mono, type.soft).class}>{step.node}</span>
							</span>
							<Badge tone="bad">{step.stage ? `Failed while ${step.stage}` : 'Failed'}</Badge>
						</span>
						{#if step.detail}
							<span class="line-clamp-2 {stylex.attrs(type.soft).class}" title={step.detail}>
								{step.detail}
							</span>
						{/if}
						<span class={stylex.attrs(type.soft).class} title={localTime(when(step), zone)}>
							Run {step.run}, {ago(when(step), live.now)}
						</span>
					</a>
				</li>
			{:else}
				<li class={stylex.attrs(type.soft).class}>No failures among the recent runs.</li>
			{/each}
		</ul>
	</section>
</div>
