<script lang="ts">
	/**
	 * The apps the view holds that are not running, a line an app however many nodes it stands
	 * stopped on: a dot, red where it should run and quiet where it was held on purpose, the app by
	 * its name, a flag a country it is stopped in, and `held` where it was. A line links to its app.
	 * With none, that is said in the middle. See spec/console/overview.md, "What is not running
	 * stands beside what happened".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { duration, text } from '@canmi/kit/tokens/vocabulary.stylex';
	import type { Live } from '../live.svelte.ts';
	import Flag from '../map/flag.svelte';
	import { isoOf, nameOf } from '../map/places.ts';
	import { scoped } from '../scope/context.ts';
	import { displayOf } from '../scope/scope.ts';
	import { tone, type } from '../style.ts';

	let {
		live,
		keep,
		limit = 10,
	}: { live: Live; keep: (app: string) => boolean; limit?: number } = $props();

	const { to } = scoped();

	/** Flags drawn before the rest are counted. */
	const FLAGS = 3;
	const COLUMNS = 'grid grid-cols-[auto_minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-x-3';

	interface Line {
		app: string;
		nodes: string[];
		/** Every node it is stopped on held it on purpose. */
		held: boolean;
	}

	/** Each app stopped somewhere, those that should run first, then by name. */
	const lines = $derived.by(() => {
		const gathered = new Map<string, Line>();
		for (const [node, entry] of Object.entries(live.view.nodes)) {
			for (const app of entry.snapshot?.apps ?? []) {
				if (app.running || !keep(app.name)) continue;
				const line = gathered.get(app.name) ?? { app: app.name, nodes: [], held: true };
				line.nodes.push(node);
				line.held &&= app.held;
				gathered.set(app.name, line);
			}
		}
		return [...gathered.values()].toSorted(
			(a, b) => Number(a.held) - Number(b.held) || displayOf(a.app).localeCompare(displayOf(b.app)),
		);
	});
	const shown = $derived(lines.slice(0, limit));
	const countries = (line: Line) => [
		...new Map(line.nodes.map((code) => [isoOf(code) ?? code, code])).values(),
	];
	const where = (line: Line) => line.nodes.map((code) => nameOf(code).full).join('\n');

	const styles = stylex.create({
		row: {
			backgroundColor: { default: 'transparent', ':hover': 'var(--color-hover)' },
			transitionProperty: 'background-color',
			transitionDuration: duration.base,
		},
		app: { color: 'var(--color-text)', fontSize: text.px13 },
		quiet: { color: 'var(--color-text-muted)', fontSize: text.px12 },
		empty: { color: 'var(--color-text-muted)', fontSize: text.px13 },
	});
</script>

{#if shown.length}
	<ul aria-label="The apps not running, those that should run first" class="flex flex-col">
		{#each shown as line (line.app)}
			{@const flags = countries(line)}
			<li>
				<a
					href={to(`/apps/${encodeURIComponent(line.app)}`)}
					class="h-7 rounded-md px-2 {COLUMNS} {stylex.attrs(styles.row).class}"
				>
					<span
						aria-hidden="true"
						class="size-1.5 rounded-full bg-current {stylex.attrs(line.held ? tone.quiet : tone.bad)
							.class}"
					></span>
					<span class="truncate {stylex.attrs(styles.app).class}">{displayOf(line.app)}</span>
					<span class="flex items-center gap-1" title={where(line)}>
						{#each flags.slice(0, FLAGS) as code (code)}
							<Flag {code} size={14} />
						{/each}
						{#if flags.length > FLAGS}
							<span class="ml-0.5 {stylex.attrs(type.shell, styles.quiet).class}"
								>+{flags.length - FLAGS}</span
							>
						{/if}
					</span>
					<span class={stylex.attrs(styles.quiet).class}>{line.held ? 'held' : ''}</span>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<p class="flex min-h-40 flex-1 items-center justify-center {stylex.attrs(styles.empty).class}">
		Every app is running
	</p>
{/if}
