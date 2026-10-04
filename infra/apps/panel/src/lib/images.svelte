<script lang="ts">
	/**
	 * Every image on the machine as host's background last found it, why each stays, when an unneeded
	 * one goes on its own, and a queue of what was asked of it. Nothing here waits on Docker: an
	 * action is queued and the page reads again. See spec/architecture/host.md, "An image is kept
	 * while something could run it".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { untrack } from 'svelte';
	import Layers from '@lucide/svelte/icons/layers';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { api, Refused, short, type Image, type Images as Known, type ImageTask } from './api';
	import Badge from './badge.svelte';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import Confirm from './confirm.svelte';
	import { ago, bytes, span } from './format';
	import PageHeader from './page-header.svelte';
	import { signedOut } from './session.svelte';
	import { surfaces, tone, type } from './style/surfaces';

	let { initial }: { initial?: Known } = $props();

	// What the server read is where the page starts; the browser then reads on its own beat.
	let known = $state<Known | undefined>(untrack(() => initial));
	let error = $state('');
	/** The clock the countdowns are read against, moved every second. */
	let now = $state(Date.now());

	async function load() {
		try {
			known = await api.images();
			error = '';
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
	}

	const busy = $derived(
		(known?.tasks ?? []).some((task) => task.state === 'queued' || task.state === 'running'),
	);

	// Often while something is queued or the first scan is still to come, and seldom otherwise.
	$effect(() => {
		const every = busy || !known?.scan ? 2000 : 15000;
		if (untrack(() => initial) === undefined && !known) load();
		const timer = setInterval(load, every);
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

	/** Queue it, and read again at once: the answer is the task, never the outcome. */
	async function ask(run: () => Promise<unknown>) {
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
		if (request) void ask(request.run);
	}

	const images = $derived(known?.scan?.images ?? []);
	const collectable = $derived(images.filter((image) => image.kept === 'no'));
	/** An upper bound: layers one of these shares with a kept image stay. */
	const loose = $derived(collectable.reduce((sum, image) => sum + image.size, 0));
	/** Images a queued or running task is about, so their row says so. */
	const asked = $derived(
		new Set(
			(known?.tasks ?? [])
				.filter((task) => task.state === 'queued' || task.state === 'running')
				.flatMap((task) =>
					task.kind === 'collect' ? collectable.map((image) => image.id) : [task.image ?? ''],
				),
		),
	);

	const counts = $derived([
		{ label: 'Images', value: String(images.length), tone: undefined },
		{
			label: 'On disk',
			value: known?.scan?.size == null ? '–' : bytes(known.scan.size),
			tone: undefined,
		},
		{ label: 'Kept', value: String(images.length - collectable.length), tone: tone.good },
		{
			label: 'Collectable',
			value: collectable.length ? `${collectable.length} · up to ${bytes(loose)}` : '0',
			tone: collectable.length ? tone.warn : undefined,
		},
	]);

	const KEPT: Record<Image['kept'], { label: string; tone: 'good' | 'busy' | 'muted' | 'warn' }> = {
		current: { label: 'Runs', tone: 'good' },
		previous: { label: 'Rollback', tone: 'busy' },
		used: { label: 'In a container', tone: 'good' },
		keeper: { label: "keeper's", tone: 'muted' },
		no: { label: 'Collectable', tone: 'warn' },
	};

	const STATE: Record<
		ImageTask['state'],
		{ label: string; tone: 'good' | 'busy' | 'muted' | 'danger' }
	> = {
		queued: { label: 'Queued', tone: 'muted' },
		running: { label: 'Running', tone: 'busy' },
		done: { label: 'Done', tone: 'good' },
		failed: { label: 'Failed', tone: 'danger' },
	};

	function named(image: Image): string {
		return image.tags[0] ?? 'Dangling';
	}

	function describe(task: ImageTask): string {
		if (task.kind === 'collect') return 'Collect every unneeded image';
		const image = images.find((image) => image.id === task.image);
		return `Remove ${image ? named(image) : short(task.image)}`;
	}

	/** How long until an unneeded image goes on its own. */
	function left(image: Image): string {
		if (!image.removed_at) return '';
		const seconds = Math.round((Date.parse(image.removed_at) - now) / 1000);
		return seconds > 0 ? `goes in ${span(seconds)}` : 'goes on the next scan';
	}

	const tasks = $derived((known?.tasks ?? []).toReversed());
</script>

<PageHeader
	title="Images"
	description={`What the machine keeps, and why; one nothing needs goes ${known ? span(known.grace_seconds) : 'an hour'} after it is found`}
>
	{#snippet actions()}
		<Button variant="ghost" icon={RefreshCw} onclick={() => ask(api.scanImages)}>Scan now</Button>
		<Button
			variant="danger"
			icon={Trash2}
			disabled={collectable.length === 0}
			onclick={() =>
				(pending = {
					title: 'Collect unneeded images now',
					detail: `Queues removing ${collectable.length} image${collectable.length === 1 ? '' : 's'} nothing runs and no rollback needs, without waiting out their hour. What an app runs, what it would go back to, what any container is made from, and host's own stay.`,
					confirm: 'Queue',
					run: api.collectImages,
				})}>Collect now</Button
		>
	{/snippet}
</PageHeader>

<div class="mb-6 grid grid-cols-4 gap-4">
	{#each counts as count (count.label)}
		<div class="flex flex-col gap-2 px-5 py-4 {stylex.attrs(surfaces.card).class}">
			<span class={stylex.attrs(type.label).class}>{count.label}</span>
			<span class={stylex.attrs(type.figure, count.tone).class}
				>{known?.scan ? count.value : '–'}</span
			>
		</div>
	{/each}
</div>

<p class="mb-4 {stylex.attrs(error ? tone.danger : type.muted).class}">
	{error ||
		(known?.scan
			? `Scanned ${ago(known.scan.at, now)}${busy ? ' · working through the queue' : ''}`
			: 'The first scan is on its way')}
</p>

<div class="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-5">
	<Card flush>
		<table>
			<thead>
				<tr><th>Image</th><th>Id</th><th>Kept</th><th>Size</th><th>Built</th><th></th></tr>
			</thead>
			<tbody>
				{#each images as image (image.id)}
					<tr>
						<td>
							<span class="inline-flex items-center gap-2.5 {stylex.attrs(type.heading).class}">
								<span class={stylex.attrs(tone.accent).class}
									><Layers size={15} strokeWidth={1.75} /></span
								>
								<span class={stylex.attrs(image.tags.length ? null : tone.muted).class}
									>{named(image)}</span
								>
							</span>
						</td>
						<td><code class={stylex.attrs(type.mono, tone.muted).class}>{short(image.id)}</code></td
						>
						<td>
							<div class="flex flex-col items-start gap-1">
								<Badge tone={KEPT[image.kept].tone}
									>{KEPT[image.kept].label}{image.app ? ` · ${image.app}` : ''}</Badge
								>
								{#if image.kept === 'no'}
									<span class={stylex.attrs(type.muted).class}>{left(image)}</span>
								{/if}
							</div>
						</td>
						<td class={stylex.attrs(tone.muted).class}>{bytes(image.size)}</td>
						<td class={stylex.attrs(tone.muted).class}>{ago(image.created)}</td>
						<td class="text-right">
							{#if image.kept === 'no'}
								{#if asked.has(image.id)}
									<Badge tone="busy">Queued</Badge>
								{:else}
									<Button
										variant="ghost"
										icon={Trash2}
										onclick={() =>
											(pending = {
												title: `Remove ${named(image)} now`,
												detail: `Queues removing ${short(image.id)}, which nothing runs and no rollback needs, without waiting out its hour.`,
												confirm: 'Queue',
												run: () => api.removeImage(image.id),
											})}>Remove</Button
									>
								{/if}
							{/if}
						</td>
					</tr>
				{:else}
					<tr
						><td colspan="6" class={stylex.attrs(tone.muted).class}
							>{known?.scan ? 'No images' : 'Scanning…'}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</Card>

	<Card title="Queue" description="What was asked, done in the background">
		{#if tasks.length === 0}
			<p class={stylex.attrs(type.muted).class}>Nothing asked yet</p>
		{:else}
			<ol class="flex flex-col gap-3">
				{#each tasks as task (task.id)}
					<li class="flex flex-col gap-1">
						<div class="flex items-center justify-between gap-3">
							<span class="truncate {stylex.attrs(type.heading).class}">{describe(task)}</span>
							<Badge tone={STATE[task.state].tone}>{STATE[task.state].label}</Badge>
						</div>
						<span
							class={stylex.attrs(type.muted, task.state === 'failed' ? tone.danger : null).class}
							>{task.detail ?? `asked ${ago(task.asked_at, now)}`}</span
						>
					</li>
				{/each}
			</ol>
		{/if}
	</Card>
</div>

{#if pending}
	<Confirm
		title={pending.title}
		detail={pending.detail}
		confirm={pending.confirm}
		danger
		onconfirm={perform}
		oncancel={() => (pending = undefined)}
	/>
{/if}
