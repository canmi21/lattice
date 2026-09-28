<script lang="ts">
	/**
	 * Every image on the machine, why each stays, and taking away the ones nothing could run again.
	 * See spec/architecture/host.md, "An image is kept while something could run it".
	 */
	import * as stylex from '@stylexjs/stylex';
	import Layers from '@lucide/svelte/icons/layers';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { api, Refused, short, type Image } from './api';
	import Badge from './badge.svelte';
	import Button from './button.svelte';
	import Card from './card.svelte';
	import Confirm from './confirm.svelte';
	import { ago, bytes } from './format';
	import PageHeader from './page-header.svelte';
	import { signedOut } from './session.svelte';
	import { surfaces, tone, type } from './style/surfaces';

	let images = $state<Image[]>([]);
	let size = $state<number | null>(null);
	let loaded = $state(false);
	let busy = $state(false);
	let error = $state('');
	let told = $state('');

	interface Pending {
		title: string;
		detail: string;
		confirm: string;
		run: () => Promise<unknown>;
	}
	let pending = $state<Pending | undefined>();

	async function load() {
		try {
			const read = await api.images();
			images = read.images;
			size = read.size;
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
		loaded = true;
	}

	$effect(() => {
		load();
	});

	async function perform() {
		const request = pending;
		pending = undefined;
		if (!request) return;
		busy = true;
		error = '';
		told = '';
		try {
			await request.run();
		} catch (failure) {
			if (!signedOut(failure))
				error = failure instanceof Refused ? failure.message : String(failure);
		}
		busy = false;
		await load();
	}

	const collectable = $derived(images.filter((image) => image.kept === 'no'));
	/** An upper bound: layers one of these shares with a kept image stay. */
	const loose = $derived(collectable.reduce((sum, image) => sum + image.size, 0));

	const counts = $derived([
		{ label: 'Images', value: String(images.length), tone: undefined },
		{ label: 'On disk', value: size === null ? '–' : bytes(size), tone: undefined },
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

	function named(image: Image): string {
		return image.tags[0] ?? 'Dangling';
	}
</script>

<PageHeader title="Images" description="What the machine keeps, and why each image stays">
	{#snippet actions()}
		<Button
			variant="danger"
			icon={Trash2}
			disabled={busy || collectable.length === 0}
			onclick={() =>
				(pending = {
					title: 'Collect unused images',
					detail: `Removes ${collectable.length} image${collectable.length === 1 ? '' : 's'} nothing runs and no rollback needs. What an app runs, what it would go back to, what any container is made from, and host's own stay.`,
					confirm: 'Collect',
					run: async () => {
						const done = await api.collectImages();
						told = `Removed ${done.removed}${done.freed === null ? '' : `, ${bytes(done.freed)} freed`}.`;
					},
				})}>Collect unused</Button
		>
	{/snippet}
</PageHeader>

<div class="mb-6 grid grid-cols-4 gap-4">
	{#each counts as count (count.label)}
		<div class="flex flex-col gap-2 px-5 py-4 {stylex.attrs(surfaces.card).class}">
			<span class={stylex.attrs(type.label).class}>{count.label}</span>
			<span class={stylex.attrs(type.figure, count.tone).class}>{loaded ? count.value : '–'}</span>
		</div>
	{/each}
</div>

{#if error || told || busy}
	<p class="mb-4 {stylex.attrs(error ? tone.danger : type.muted).class}">
		{error || (busy ? 'Working…' : told)}
	</p>
{/if}

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
					<td><code class={stylex.attrs(type.mono, tone.muted).class}>{short(image.id)}</code></td>
					<td>
						<Badge tone={KEPT[image.kept].tone}
							>{KEPT[image.kept].label}{image.app ? ` · ${image.app}` : ''}</Badge
						>
					</td>
					<td class={stylex.attrs(tone.muted).class}>{bytes(image.size)}</td>
					<td class={stylex.attrs(tone.muted).class}>{ago(image.created)}</td>
					<td class="text-right">
						{#if image.kept === 'no'}
							<Button
								variant="ghost"
								icon={Trash2}
								disabled={busy}
								onclick={() =>
									(pending = {
										title: `Remove ${named(image)}`,
										detail: `Removes ${short(image.id)}, which nothing runs and no rollback needs.`,
										confirm: 'Remove',
										run: () => api.removeImage(image.id),
									})}>Remove</Button
							>
						{/if}
					</td>
				</tr>
			{:else}
				<tr
					><td colspan="6" class={stylex.attrs(tone.muted).class}
						>{loaded ? 'No images' : 'Loading…'}</td
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
		danger
		onconfirm={perform}
		oncancel={() => (pending = undefined)}
	/>
{/if}
