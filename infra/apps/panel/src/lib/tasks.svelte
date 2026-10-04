<script lang="ts">
	/**
	 * Every task any service was asked to do, newest first: what it was, how it went, how long it
	 * took. See spec/architecture/ledger.md, "Read by the panel".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import { api, TASK_PAGE_SIZE, type Task, type TaskFilter } from './api';
	import Badge from './badge.svelte';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import { ago, span } from './format';
	import PageHeader from './page-header.svelte';
	import Segmented from './segmented.svelte';
	import { signedOut } from './session.svelte';
	import { tone, type } from './style/surfaces';

	let { initial }: { initial?: Task[] } = $props();

	let tasks = $state<Task[]>(untrack(() => initial ?? []));
	let loaded = $state(untrack(() => initial !== undefined));
	let more = $state(untrack(() => (initial?.length ?? 0) === TASK_PAGE_SIZE));
	let error = $state('');
	/** The clock durations and countdowns are read against, moved every second. */
	let now = $state(Date.now());

	const STATES: Task['state'][] = ['queued', 'running', 'done', 'failed'];
	let stateFilter = $state<Task['state'] | 'all'>('all');
	/** Built from services seen so far: there is no endpoint that lists them on their own. */
	let serviceFilter = $state('all');
	const services = $derived(
		Array.from(new Set(tasks.map((task) => task.service))).sort((a, b) => a.localeCompare(b)),
	);

	const filter = $derived<TaskFilter>({
		service: serviceFilter === 'all' ? undefined : serviceFilter,
		state: stateFilter === 'all' ? undefined : stateFilter,
	});

	/** The freshest page, replacing what is shown. Used both to load and to poll. */
	async function reload(limit: number) {
		try {
			const page = await api.tasks(filter, undefined, limit);
			tasks = page;
			more = page.length === limit;
			error = '';
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
		loaded = true;
	}

	async function older() {
		try {
			const before = tasks.at(-1)?.cursor;
			const page = await api.tasks(filter, before);
			tasks = [...tasks, ...page];
			more = page.length === TASK_PAGE_SIZE;
			error = '';
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
	}

	// A filter change starts the list over.
	$effect(() => {
		void filter;
		if (untrack(() => loaded)) void reload(TASK_PAGE_SIZE);
	});

	const busy = $derived(tasks.some((task) => task.state === 'queued' || task.state === 'running'));

	// Often while something is queued or running, seldom otherwise. Refreshes the same span
	// already shown, at most the 500 rows the ledger answers with in one page.
	$effect(() => {
		const every = busy ? 4000 : 30000;
		if (untrack(() => initial) === undefined && !untrack(() => loaded)) void reload(TASK_PAGE_SIZE);
		const timer = setInterval(
			() => void reload(Math.min(Math.max(tasks.length, TASK_PAGE_SIZE), 500)),
			every,
		);
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

	/** How long a task ran, or has been running: `started_at` to `finished_at`, or to now. */
	function took(task: Task): string {
		if (!task.started_at) return '–';
		const end = task.finished_at ? Date.parse(task.finished_at) : now;
		const seconds = Math.max(0, Math.round((end - Date.parse(task.started_at)) / 1000));
		return span(seconds);
	}

	/** The summary's `url` when there is one, else the first field, else nothing. */
	function summarize(task: Task): string {
		const summary = task.summary;
		if (typeof summary?.url === 'string') return summary.url;
		const first = Object.entries(summary ?? {})[0];
		return first ? `${first[0]}: ${JSON.stringify(first[1])}` : '';
	}
</script>

<PageHeader title="Tasks" description="What every service was asked to do, newest first">
	{#snippet actions()}
		<Segmented
			options={[
				{ key: 'all', label: 'All' },
				...STATES.map((state) => ({
					key: state,
					label: state.charAt(0).toUpperCase() + state.slice(1),
				})),
			]}
			bind:value={stateFilter}
		/>
		<select bind:value={serviceFilter}>
			<option value="all">Every service</option>
			{#each services as service (service)}
				<option value={service}>{service}</option>
			{/each}
		</select>
	{/snippet}
</PageHeader>

{#if error}<p class="mb-4 {stylex.attrs(tone.danger).class}">{error}</p>{/if}

<Card flush>
	<table>
		<thead>
			<tr>
				<th>Service</th><th>Kind</th><th>State</th><th>Caller</th><th>Asked</th><th>Took</th><th
					>Summary</th
				>
			</tr>
		</thead>
		<tbody>
			{#each tasks as task (`${task.service}/${task.id}`)}
				<tr>
					<td>
						<a
							class={stylex.attrs(type.heading).class}
							href="/tasks/{encodeURIComponent(task.service)}/{encodeURIComponent(task.id)}"
							>{task.service}</a
						>
					</td>
					<td class={stylex.attrs(tone.muted).class}>{task.kind}</td>
					<td><Badge tone={STATE_TONE[task.state]}>{task.state}</Badge></td>
					<td class={stylex.attrs(tone.muted).class}>{task.caller}</td>
					<td class={stylex.attrs(tone.muted).class} title={task.asked_at}
						>{ago(task.asked_at, now)}</td
					>
					<td class={stylex.attrs(tone.muted).class}>{took(task)}</td>
					<td class="max-w-md truncate {stylex.attrs(tone.muted).class}" title={summarize(task)}
						>{summarize(task)}</td
					>
				</tr>
			{:else}
				<tr
					><td colspan="7" class={stylex.attrs(tone.muted).class}
						>{loaded ? 'No tasks' : 'Loading…'}</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</Card>
{#if more && tasks.length > 0}
	<div class="mt-4 flex justify-center">
		<Button variant="ghost" onclick={older}>Load more</Button>
	</div>
{/if}
