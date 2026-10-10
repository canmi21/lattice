<script lang="ts">
	import { onMount } from 'svelte';
	import { observeTheme } from '@canmi/kit/theme';
	import { CONTRACT, type Group } from '@canmi/design/contract';

	/**
	 * Each name's value as the page is painted, read off the document rather than written here, so
	 * what is shown is what a component gets; empty until the browser has painted.
	 */
	let values = $state<Record<string, string>>({});

	function measure() {
		const painted = getComputedStyle(document.documentElement);
		// A color made of others is read laid on an element, where the browser works it out; the
		// property alone would hand back the expression.
		const probe = document.body.appendChild(document.createElement('span'));
		values = Object.fromEntries(
			CONTRACT.flatMap(({ group, names }) =>
				names.map((name) => {
					if (!COLORS.has(group)) return [name, painted.getPropertyValue(name).trim()];
					probe.style.backgroundColor = `var(${name})`;
					return [name, getComputedStyle(probe).backgroundColor];
				}),
			),
		);
		probe.remove();
	}

	onMount(() => {
		measure();
		return observeTheme(measure);
	});

	/** The groups whose values are colors. */
	const COLORS = new Set<Group>([
		'background',
		'border',
		'foreground',
		'interaction',
		'accent',
		'status',
	]);

	/** How a group's value is shown: laid as a ground, drawn as text or a rule, or set as type. */
	const SHOWN: Record<Group, 'ground' | 'text' | 'rule' | 'shadow' | 'type'> = {
		background: 'ground',
		border: 'rule',
		foreground: 'text',
		interaction: 'ground',
		accent: 'ground',
		status: 'ground',
		shadow: 'shadow',
		font: 'type',
	};
</script>

<svelte:head>
	<title>Design</title>
</svelte:head>

<div class="flex max-w-5xl flex-col gap-10">
	<header class="flex flex-col gap-1">
		<h1 class="text-xl font-medium text-(--foreground-strong)">Tokens</h1>
		<p class="text-(--foreground-muted)">
			The contract every component reads, with mono's values for the theme on screen.
		</p>
	</header>

	{#each CONTRACT as { group, names } (group)}
		<section class="flex flex-col gap-3">
			<h2 class="font-medium text-(--foreground-strong) capitalize">{group}</h2>
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
				{#each names as name (name)}
					<li
						class="flex flex-col overflow-hidden rounded-xl border border-(--border-default) bg-(--background-surface)"
					>
						<div
							class="flex h-20 items-center justify-center"
							style:background="var(--background-surface)"
						>
							{#if SHOWN[group] === 'ground'}
								<span class="size-full" style:background="var({name})"></span>
							{:else if SHOWN[group] === 'text'}
								<span class="text-2xl font-medium" style:color="var({name})">Aa</span>
							{:else if SHOWN[group] === 'rule'}
								<span class="h-10 w-24 rounded-lg border" style:border-color="var({name})"></span>
							{:else if SHOWN[group] === 'shadow'}
								<span
									class="h-10 w-24 rounded-lg bg-(--background-surface)"
									style:box-shadow="var({name})"
								></span>
							{:else if name === '--font-sans-cap-height'}
								<span class="flex items-baseline gap-1 text-3xl text-(--foreground-strong)">
									H<span class="w-1 bg-(--accent)" style:height="var({name})"></span>
								</span>
							{:else}
								<span class="text-xl text-(--foreground-strong)" style:font-family="var({name})"
									>Ag 0123</span
								>
							{/if}
						</div>
						<div class="flex flex-col gap-0.5 border-t border-(--border-default) px-3 py-2">
							<code class="font-mono text-xs text-(--foreground-strong)">{name}</code>
							<span
								class="truncate font-mono text-xs text-(--foreground-muted)"
								title={values[name]}>{values[name] ?? ''}</span
							>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
