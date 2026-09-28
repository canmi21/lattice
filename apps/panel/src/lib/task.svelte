<script lang="ts">
	/**
	 * One task: its fields, its parent and children, and its events as a timeline in `seq` order.
	 * See spec/architecture/ledger.md, "A task, and the events that make it up".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import { api, when, type Task, type TaskDetail, type TaskEvent } from './api';
	import Badge from './badge.svelte';
	import Card from './card.svelte';
	import { ago, span } from './format';
	import PageHeader from './page-header.svelte';
	import { signedOut } from './session.svelte';
	import { surfaces, tone, type } from './style/surfaces';

	let { service, id, initial }: { service: string; id: string; initial?: TaskDetail } = $props();

	let detail = $state<TaskDetail | undefined>(untrack(() => initial));
	let error = $state('');
	let now = $state(Date.now());

	async function load() {
		try {
			detail = await api.task(service, id);
			error = '';
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
	}

	const unfinished = $derived(detail?.state === 'queued' || detail?.state === 'running');

	$effect(() => {
		if (untrack(() => initial) === undefined) load();
		if (!unfinished) return;
		const timer = setInterval(load, 3000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const STATE_TONE: Record<Task['state'], 'good' | 'busy' | 'muted' | 'danger'> = {
		queued: 'muted',
		running: 'busy',
		done: 'good',
		failed: 'danger',
	};

	const LEVEL_TONE: Record<TaskEvent['level'], 'good' | 'warn' | 'danger'> = {
		info: 'good',
		warn: 'warn',
		error: 'danger',
	};

	function took(): string {
		if (!detail?.started_at) return '–';
		const end = detail.finished_at ? Date.parse(detail.finished_at) : now;
		return span(Math.max(0, Math.round((end - Date.parse(detail.started_at)) / 1000)));
	}

	/** A small object as `key: value` pairs, one a line. */
	function entries(data: Record<string, unknown> | undefined): [string, string][] {
		return Object.entries(data ?? {}).map(([key, value]) => [
			key,
			typeof value === 'string' ? value : JSON.stringify(value),
		]);
	}

	/** How long since the event before this one, or since the task was asked, for the first. */
	function since(events: TaskEvent[], index: number): string {
		const before = index > 0 ? Date.parse(events[index - 1]!.at) : Date.parse(detail!.asked_at);
		const seconds = Math.max(0, Math.round((Date.parse(events[index]!.at) - before) / 1000));
		return index === 0 ? `${span(seconds)} after asked` : `+${span(seconds)}`;
	}
</script>

{#if error}<p class="mb-4 {stylex.attrs(tone.danger).class}">{error}</p>{/if}

{#if detail}
	{@const task = detail}
	<PageHeader title="{task.kind} · {task.service}" back={{ href: '/tasks', label: 'Tasks' }}>
		{#snippet meta()}
			<Badge tone={STATE_TONE[task.state]}>{task.state}</Badge>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-5">
		<Card title="Timeline">
			<ol class="flex flex-col gap-4">
				{#each detail.events as event, index (event.seq)}
					<li class="flex gap-3">
						<span
							class="mt-1.5 size-2 shrink-0 rounded-full {stylex.attrs(
								tone[LEVEL_TONE[event.level]],
							).class}"
							style="background-color: currentColor;"
						></span>
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<span class={stylex.attrs(type.heading).class}>{event.stage}</span>
								<span class={stylex.attrs(type.muted).class} title={when(event.at)}
									>{ago(event.at, now)} · {since(detail.events, index)}</span
								>
							</div>
							<p class={stylex.attrs(type.body).class}>{event.message}</p>
							{#if entries(event.data).length > 0}
								<dl class="flex flex-col gap-0.5">
									{#each entries(event.data) as [key, value] (key)}
										<div class="flex gap-2 {stylex.attrs(type.mono, tone.muted).class}">
											<dt>{key}:</dt>
											<dd class="truncate">{value}</dd>
										</div>
									{/each}
								</dl>
							{/if}
						</div>
					</li>
				{:else}
					<p class={stylex.attrs(type.muted).class}>No events yet</p>
				{/each}
			</ol>
		</Card>

		<div class="flex flex-col gap-5">
			<Card title="Task">
				<dl class="flex flex-col gap-2">
					<div class="flex justify-between gap-3">
						<dt class={stylex.attrs(type.label).class}>Caller</dt>
						<dd class={stylex.attrs(type.body).class}>{task.caller}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class={stylex.attrs(type.label).class}>Asked</dt>
						<dd class={stylex.attrs(type.body).class} title={when(task.asked_at)}>
							{ago(task.asked_at, now)}
						</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class={stylex.attrs(type.label).class}>Took</dt>
						<dd class={stylex.attrs(type.body).class}>{took()}</dd>
					</div>
					{#if task.parent}
						<div class="flex justify-between gap-3">
							<dt class={stylex.attrs(type.label).class}>Parent</dt>
							<dd>
								<a
									class={stylex.attrs(type.body).class}
									href="/tasks/{encodeURIComponent(task.parent.service)}/{encodeURIComponent(
										task.parent.id,
									)}">{task.parent.service}/{task.parent.id}</a
								>
							</dd>
						</div>
					{/if}
					{#if entries(task.summary).length > 0}
						<div class="flex flex-col gap-1 border-t pt-2 {stylex.attrs(surfaces.hairline).class}">
							{#each entries(task.summary) as [key, value] (key)}
								<div class="flex gap-2 {stylex.attrs(type.mono, tone.muted).class}">
									<dt>{key}:</dt>
									<dd class="truncate">{value}</dd>
								</div>
							{/each}
						</div>
					{/if}
					{#if task.detail}
						<pre
							class="mt-1 max-h-48 overflow-auto p-3 whitespace-pre-wrap {stylex.attrs(
								surfaces.well,
								tone.danger,
							).class}">{task.detail}</pre>
					{/if}
				</dl>
			</Card>

			{#if detail.children.length > 0}
				<Card title="Children">
					<ul class="flex flex-col gap-2">
						{#each detail.children as child (`${child.service}/${child.id}`)}
							<li class="flex items-center justify-between gap-2">
								<a
									class={stylex.attrs(type.body).class}
									href="/tasks/{encodeURIComponent(child.service)}/{encodeURIComponent(child.id)}"
									>{child.service}/{child.id}</a
								>
								<Badge tone={STATE_TONE[child.state]}>{child.state}</Badge>
							</li>
						{/each}
					</ul>
				</Card>
			{/if}
		</div>
	</div>
{:else}
	<p class={stylex.attrs(type.muted).class}>Loading…</p>
{/if}
