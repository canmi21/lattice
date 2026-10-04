<script lang="ts">
	/**
	 * Every job cron runs on this node: its schedule, when it is next due, how its last run went,
	 * and whether it is paused. See spec/architecture/cron.md, "Seen in the panel".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import { api, Refused, type Outcome, type Schedule } from './api';
	import Badge from './badge.svelte';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import Confirm from './confirm.svelte';
	import { scheduleHint } from './cron-text';
	import { span, until } from './format';
	import LocalTime from './local-time.svelte';
	import PageHeader from './page-header.svelte';
	import { signedOut } from './session.svelte';
	import { tone, type } from './style/surfaces';

	let { initial }: { initial?: Schedule[] } = $props();

	// What the server read is where the page starts; the browser then reads on its own beat.
	let schedules = $state<Schedule[]>(untrack(() => initial ?? []));
	let loaded = $state(untrack(() => initial !== undefined));
	let error = $state('');
	/** The clock "next run" and "took" are read against, moved every second. */
	let now = $state(Date.now());

	async function load() {
		try {
			schedules = await api.schedules();
			error = '';
		} catch (failure) {
			if (!signedOut(failure)) error = String(failure);
		}
		loaded = true;
	}

	// Polled every 15s, per spec/architecture/cron.md, "Seen in the panel".
	$effect(() => {
		if (untrack(() => initial) === undefined && !untrack(() => loaded)) void load();
		const timer = setInterval(load, 15000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	interface Pending {
		title: string;
		detail: string;
		confirm: string;
		run: () => Promise<unknown>;
	}
	let pending = $state<Pending | undefined>();

	/** Ask, then read again at once: the answer is the run queued, never its outcome. */
	async function act(run: () => Promise<unknown>) {
		try {
			await run();
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
		await load();
	}

	function perform() {
		const request = pending;
		pending = undefined;
		if (request) void act(request.run);
	}

	function runNow(job: Schedule) {
		pending = {
			title: `Run ${job.name} now`,
			detail: `Asks ${job.service} to run ${job.name} at once, outside its schedule.`,
			confirm: 'Run',
			run: () => api.runSchedule(job.service, job.name),
		};
	}

	const OUTCOME_TONE: Record<Outcome, 'good' | 'busy' | 'muted' | 'danger'> = {
		running: 'busy',
		done: 'good',
		failed: 'danger',
		skipped: 'muted',
	};

	/** How long a run took: `started_at` to `finished_at`. Nothing to show while still running. */
	function took(job: Schedule): string | undefined {
		const last = job.last;
		if (!last?.finished_at) return undefined;
		const seconds = Math.max(
			0,
			Math.round((Date.parse(last.finished_at) - Date.parse(last.started_at)) / 1000),
		);
		return span(seconds);
	}
</script>

<PageHeader
	title="Schedules"
	description="Every job cron runs on this node, and when it last did"
/>

{#if error}<p class="mb-4 {stylex.attrs(tone.danger).class}">{error}</p>{/if}

<Card flush>
	<table>
		<thead>
			<tr>
				<th>Service</th><th>Name</th><th>Schedule</th><th>Next run</th><th>Last run</th><th></th>
			</tr>
		</thead>
		<tbody>
			{#each schedules as job (`${job.service}/${job.name}`)}
				<tr>
					<td class={stylex.attrs(type.heading).class}>{job.service}</td>
					<td class={stylex.attrs(tone.muted).class}>{job.name}</td>
					<td>
						<div class="flex flex-col gap-0.5">
							<code class={stylex.attrs(type.mono).class}>{job.cron ?? job.every}</code>
							{#if scheduleHint(job.cron, job.every)}
								<span class={stylex.attrs(type.muted).class}
									>{scheduleHint(job.cron, job.every)}</span
								>
							{/if}
							<div class="flex gap-1.5">
								{#if job.paused}<Badge tone="warn">Paused</Badge>{/if}
								{#if job.running}<Badge tone="busy">Running</Badge>{/if}
								{#if job.queued}<Badge tone="muted">Queued behind it</Badge>{/if}
							</div>
						</div>
					</td>
					<td>
						{#if job.next}
							<div class="flex flex-col gap-0.5">
								<LocalTime stamp={job.next} />
								<span class={stylex.attrs(tone.muted).class}>{until(job.next, now)}</span>
							</div>
						{:else}
							<span class={stylex.attrs(tone.muted).class}>–</span>
						{/if}
					</td>
					<td>
						{#if job.last}
							<div class="flex flex-col gap-0.5">
								<div class="flex items-center gap-2">
									<Badge tone={OUTCOME_TONE[job.last.outcome]}>{job.last.outcome}</Badge>
									<a
										class={stylex.attrs(type.muted).class}
										href="/tasks/cron/{encodeURIComponent(job.last.run)}">task</a
									>
								</div>
								<span class={stylex.attrs(tone.muted).class}>
									{#if job.last.finished_at}<LocalTime
											stamp={job.last.finished_at}
										/>{:else}<LocalTime stamp={job.last.started_at} /> · still running{/if}
									{#if took(job)}&nbsp;· {took(job)}{/if}
								</span>
							</div>
						{:else}
							<span class={stylex.attrs(tone.muted).class}>never run</span>
						{/if}
					</td>
					<td class="w-48">
						<div class="flex justify-end gap-2">
							<Button variant="ghost" icon={Play} onclick={() => runNow(job)}>Run now</Button>
							{#if job.paused}
								<Button
									variant="ghost"
									icon={Play}
									onclick={() => act(() => api.resumeSchedule(job.service, job.name))}
									>Resume</Button
								>
							{:else}
								<Button
									variant="ghost"
									icon={Pause}
									title="Lasts until cron restarts"
									onclick={() => act(() => api.pauseSchedule(job.service, job.name))}>Pause</Button
								>
							{/if}
						</div>
					</td>
				</tr>
			{:else}
				<tr
					><td colspan="6" class={stylex.attrs(tone.muted).class}
						>{loaded ? 'No schedules' : 'Loading…'}</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</Card>

{#if pending}
	<Confirm
		title={pending.title}
		detail={pending.detail}
		confirm={pending.confirm}
		onconfirm={perform}
		oncancel={() => (pending = undefined)}
	/>
{/if}
