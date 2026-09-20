<script module lang="ts">
	import { page } from '$app/state';
	import * as stylex from '@stylexjs/stylex';
	import { surfaces } from '$lib/surfaces.ts';
	import { duration, easing, radius, text, transition, weight } from '$lib/vocabulary.stylex.ts';

	/**
	 * The visual half of the subscription surface. Every colour is the token variable `libs/tokens`
	 * already declares, so nothing here can change one. See spec/architecture/css/authoring.md.
	 *
	 * The scoped block at the foot of this file keeps the eight keyframes and their names, the
	 * `--pill-overhang` geometry, and `--pill-height`, read back down through `app.css` -- a
	 * migration moves a declaration between layers and never changes how a value is arrived at. See
	 * spec/todo.md, and spec/architecture/css/authoring.md for what these comments must not do.
	 */
	const styles = stylex.create({
		/** Both readings of the pitch; which one shows is a width question, kept in the markup. */
		pitch: {
			color: 'var(--color-text-soft)',
		},
		pill: {
			// The clamp to half the box is the browser's, so the radius is stated as the unbounded
			// length Tailwind's pill corner is rather than as a number.
			borderRadius: radius.full,
		},
		/**
		 * One ink for both halves of the swap. They share a grid cell and show the same address,
		 * one plain and one masked, and they arrived at the same colour from two places -- the
		 * markup for the mask, the scoped block for the copy that lifts away.
		 */
		address: {
			color: 'var(--color-text)',
		},
		chip: {
			borderRadius: radius.full,
			fontWeight: weight.medium,
			// Ink is for the thing worth pressing. Once pressed this is a label, so it keeps the
			// shape and gives up the emphasis; cooling out of ink over the same span as the reveal
			// shows it is the same control settling rather than a different one appearing.
			//
			// These two are also the `cool` keyframe's `to` block, which cannot be written here
			// and now restates them from the other layer. See spec/todo.md.
			backgroundColor: 'var(--color-paper-hover)',
			color: 'var(--color-text-soft)',
		},
		field: {
			backgroundColor: 'transparent',
			color: { default: 'var(--color-text)', ':disabled': 'var(--color-text-soft)' },
			'::placeholder': { color: 'var(--color-text-soft)' },
		},
		submit: {
			borderRadius: radius.full,
			backgroundColor: 'var(--color-ink)',
			fontWeight: weight.medium,
			color: 'var(--color-page)',
			// `:hover` and `:disabled` can both match here, and the layers rank them differently.
			// See spec/architecture/css/authoring.md, "Two conditions that can both be true are made
			// exclusive, never ranked", for why the hover condition is spelled out below.
			opacity: {
				default: null,
				':disabled': 0.6,
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the fade from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover:not(:disabled)': 0.85 },
			},
			transitionProperty: 'opacity',
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
		row: {
			fontSize: text.px15,
			color: 'var(--color-text-soft)',
		},
		/**
		 * The hidden labels that decide the cell's width carry the button's own type, not the
		 * row's: this row is a size smaller and lighter, and either difference would narrow the
		 * reserved cell.
		 *
		 * The line stays a ratio -- `calc(1.5 / 1)` is exactly 1.5, so the rule in
		 * spec/architecture/css/authoring.md against ratios that never terminate does not apply. What
		 * reserves the width is layout, below.
		 */
		ghost: {
			fontSize: '1rem',
			lineHeight: 1.5,
			fontWeight: weight.medium,
		},
		undo: {
			color: {
				default: null,
				// Gated on a pointer that can actually hover, which is what Tailwind's `hover`
				// variant does and what keeps the colour from latching on after a tap.
				'@media (hover: hover)': { default: null, ':hover': 'var(--color-text-strong)' },
				':focus-visible': 'var(--color-text-strong)',
			},
			opacity: { default: null, ':disabled': 0.6 },
			// The whole of `transition.colors`, the three `--tw-gradient-*` variables included --
			// dropping them changes the computed value even though nothing here sets a gradient.
			// None of the three actually reaches the element, since `.spring-underline` is
			// unlayered and already owns `transition`; see spec/architecture/css/layers.md, "There is a
			// fourth participant, and it sits above the visual layer". Carried across unchanged
			// on purpose, and recorded in spec/todo.md.
			transitionProperty: transition.colors,
			transitionDuration: duration.base,
			transitionTimingFunction: easing.inOut,
		},
	});
</script>

<script lang="ts">
	import { ParaglideMessage } from '@inlang/paraglide-js-svelte';
	import Counter from '$lib/components/counter.svelte';
	import {
		createCancelMutation,
		createStatsQuery,
		createNewsletterMutation,
		readSubscription,
		type Subscription,
	} from '$lib/engagement/engagement.svelte';
	import type { LocaleCode } from '$lib/locale';
	import { maskEmail } from '$lib/newsletter/mask';
	import {
		REVERSE,
		REVERSE_TOTAL,
		SEQUENCE,
		SEQUENCE_TOTAL,
		sequenceStyle,
	} from '$lib/newsletter/sequence';
	import * as m from '$lib/paraglide/messages';

	let {
		class: className = '',
		locale,
		offer = false,
	}: {
		class?: string;
		locale: LocaleCode;
		/**
		 * Offer a subscription rather than stand as a fixture: present only on a device that
		 * holds no subscription of its own.
		 *
		 * The homepage takes the default and is always there, because it is where a subscriber
		 * goes to cancel and something has to stay reachable. After an article the section is an
		 * offer, and an offer put to somebody who already accepted it is the thing this removes.
		 */
		offer?: boolean;
	} = $props();

	// Rendered on the server, so the subscriber count is in the HTML rather than arriving after.
	const engagement = createStatsQuery(() => page.data.stats);
	const newsletter = createNewsletterMutation();
	const cancellation = createCancelMutation();
	const subscribers = $derived(engagement.data?.subscriber_count ?? 0);
	let email = $state('');
	let status = $state<'idle' | 'sending' | 'confirmed' | 'error' | 'cancelled'>('idle');
	let subscription = $state<Subscription | undefined>();
	let confirmed = $state<string | undefined>();
	/**
	 * The address as it was typed, kept only long enough to hand the swap something to animate
	 * away from. Set by an interaction and never by the record read at mount, which is why a
	 * returning reader arrives at the confirmed pill already still.
	 */
	let entering = $state<string | undefined>();
	/**
	 * Where the transition has got to. `still` covers both ends of it: nothing is running, either
	 * because nothing has happened yet or because everything already has.
	 */
	let stage = $state<'still' | 'redacting' | 'settling' | 'undoing' | 'reverting' | 'restoring'>(
		'still',
	);
	let timers: ReturnType<typeof setTimeout>[] = [];

	/**
	 * Whether an offered section has been put on the page.
	 *
	 * **Set once, at mount, and nothing ever clears it.** Deriving presence from the record instead
	 * would delete the section the moment somebody subscribed inside it -- 2.1 seconds of
	 * confirmation playing inside an element that is removing itself. Latched, subscribing keeps
	 * everything on screen until the page is left; the confirmation copy already sits on that line:
	 * what the reader just did lasts one visit, and what they are is what the next load reads.
	 */
	let appended = $state(false);
	const present = $derived(!offer || appended);

	// The record is on the reader's device, so the server renders the form and this replaces it
	// after mount. Both states are one pill tall, so the swap moves nothing around it. An offered
	// section has nothing to replace: the server sends none, and one is appended here if this
	// device turns out to have no subscription.
	$effect(() => {
		// Read into a local and test that, never the state field. Testing `subscription` would make
		// this effect depend on a value it also writes, so submitting -- which re-reads the record --
		// would re-run it, and the cleanup below would clear the timers of the sequence still playing.
		const record = readSubscription();
		subscription = record;
		if (!record) appended = true;
		return stop;
	});

	function stop() {
		for (const timer of timers) clearTimeout(timer);
		timers = [];
	}

	function after(delay: number, run: () => void) {
		timers.push(setTimeout(run, delay));
	}

	// Subscribing twice from a device that never held the token confirms the address without
	// offering to cancel it. That device genuinely cannot, and an unsubscribe control that always
	// fails would be worse than not showing one.
	const shown = $derived(subscription?.email ?? confirmed);
	const masked = $derived(shown ? maskEmail(shown) : '');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (status === 'sending') return;
		status = 'sending';
		const typed = email;
		try {
			const result = await newsletter.mutateAsync(email);
			email = '';
			confirmed = result.email;
			subscription = readSubscription();
			// Reduced motion arrives at the end of the sequence directly. Every stage of it exists
			// to be watched, so with nothing to watch there is only the state it lands on.
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				status = 'confirmed';
				return;
			}
			// Only for this visit. A reload lands on the subscriber count, since by then the pill
			// already says the reader is on the list and the sentence has been read.
			entering = typed;
			stage = 'redacting';
			after(SEQUENCE.row.at, () => {
				status = 'confirmed';
				stage = 'settling';
			});
			after(SEQUENCE.undo.at, () => (stage = 'undoing'));
			after(SEQUENCE_TOTAL, () => {
				entering = undefined;
				stage = 'still';
			});
		} catch {
			status = 'error';
		}
	}

	async function unsubscribe() {
		// `reverting` is part of the guard, not just `isPending`: the record is held on screen after
		// the request has returned, and a second click would spend it on a subscription that is
		// already gone.
		if (!subscription || cancellation.isPending || stage === 'reverting') return;
		const record = subscription;
		try {
			await cancellation.mutateAsync(record);
			stop();
			entering = undefined;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				settle();
				return;
			}
			// The pill keeps showing the address it is undoing until the sequence has taken it back
			// off, so the record outlives the request that cancelled it by exactly that long.
			stage = 'reverting';
			after(REVERSE.form.at, () => {
				settle();
				stage = 'restoring';
			});
			after(REVERSE_TOTAL, () => (stage = 'still'));
		} catch {
			status = 'error';
		}
	}

	function settle() {
		subscription = undefined;
		confirmed = undefined;
		stage = 'still';
		status = 'cancelled';
	}
</script>

<!-- Both labels are laid out in every state and the unused one is only made invisible, so the
button is as wide as the wider of the two and its edge does not move when the copy changes. The
alternative is animating a width the stylesheet cannot know, which is a measurement this does not
otherwise need. See spec/engagement.md. -->
{#snippet label(subscribed: boolean)}
	<span
		class="inline-grid place-items-center"
		class:crossfading={entering}
		class:recrossing={stage === 'reverting'}
	>
		<span
			class="col-start-1 row-start-1 whitespace-nowrap {subscribed ? 'invisible' : ''}"
			class:spent={subscribed}
			aria-hidden={subscribed}
		>
			{m['newsletter.subscribe']({}, { locale })}
		</span>
		<span
			class="col-start-1 row-start-1 whitespace-nowrap {subscribed ? '' : 'invisible'}"
			class:spent={!subscribed}
			aria-hidden={!subscribed}
		>
			{m['newsletter.subscribed']({}, { locale })}
		</span>
	</span>
{/snippet}

<!-- The gap above belongs to whatever this follows, so it comes from the caller: after an article
     it separates two offerings, after the collected notes it closes a smaller block of apparatus,
     and those are not the same distance. A component that carried one number would make the
     shorter one an override fighting it. -->
{#if present}
	<section
		aria-labelledby="newsletter-heading"
		class="pill-metrics {className}"
		style={sequenceStyle()}
	>
		<h2 id="newsletter-heading" class="selectable mb-3 {stylex.attrs(surfaces.heading).class}">
			{m['newsletter.heading']({}, { locale })}
		</h2>

		<!-- Two readings of one pitch, chosen by width. A phone gets the shorter one -- the same
		     invitation in fewer sentences, since the long version runs to five or six lines there.

		     Both are in the markup and one is `display: none`, so a screen reader is read exactly
		     one of them. The bio does this with markers inside its markdown; a message has none,
		     so the choice is made here. See spec/styling/phone.md. -->
		<p class="selectable hidden sm:block {stylex.attrs(styles.pitch).class}">
			{m['newsletter.pitch']({}, { locale })}
		</p>
		<p class="selectable sm:hidden {stylex.attrs(styles.pitch).class}">
			{m['newsletter.pitch.short']({}, { locale })}
		</p>

		<!-- One pill across both states. The box, its border and the button's place never move; only
		what sits in them is replaced, which is what leaves the swap something to animate rather than
		something to jump between.

		The cursor is stated rather than left to `auto`, which draws an I-beam over the masked
		address -- selecting a row of bullets invites copying something that is not there. The field
		re-asserts what a field is, from the block below. -->
		<div
			class="pill focus-input-shell mt-4 mx-[calc(-1_*_var(--pill-overhang))] flex cursor-default items-center gap-2 p-1.5 pl-5 {stylex.attrs(
				surfaces.paper,
				styles.pill,
			).class}"
			role={shown ? 'status' : undefined}
		>
			{#if shown}
				<span aria-hidden="true" class="inline-grid min-w-0 flex-1 items-center">
					{#if entering}
						<!-- A plain copy of what was typed, standing in for the field that has just gone so
						the address appears to be redacted in place rather than replaced. -->
						<span
							class="typed col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-nowrap {stylex.attrs(
								styles.address,
							).class}">{entering}</span
						>
					{/if}
					<!-- The address is already unreadable, so nothing is gained by letting it wrap. -->
					<span
						class="masked col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-nowrap {stylex.attrs(
							styles.address,
						).class}"
						class:revealing={entering}
						class:dissolving={stage === 'reverting'}
					>
						{masked}
					</span>
				</span>
				<!-- The button's surface stays and its copy states the outcome, so the shape the reader
				just used becomes the label for what it did. It is inert -- there is nothing left to
				submit -- and it is the pill's whole accessible content, the masked address being of no
				use read aloud. Keeping the shape is also what invites a second press -- a pill in the
				place a pill was just pressed -- so the pointer refuses one before the click happens. -->
				<span
					class="chip flex h-full shrink-0 cursor-not-allowed items-center px-4 {stylex.attrs(
						styles.chip,
					).class}"
					class:cooling={entering}
					class:warming={stage === 'reverting'}
				>
					{@render label(stage !== 'reverting')}
				</span>
			{:else}
				<!-- `type="email"` plus `required` leaves validation to the browser: it is localized
				already, it reports before any request is made, and it needs no JavaScript.
				`display: contents` keeps the form out of the shared pill's layout. -->
				<form onsubmit={submit} class="contents">
					<input
						type="email"
						name="email"
						bind:value={email}
						required
						autocomplete="email"
						placeholder="you@example.com"
						aria-label={m['newsletter.email']({}, { locale })}
						disabled={status === 'sending'}
						class:returning={stage === 'restoring'}
						class="focus-input min-w-0 flex-1 {stylex.attrs(styles.field).class}"
					/>
					<button
						type="submit"
						disabled={status === 'sending'}
						aria-busy={status === 'sending'}
						class:reviving={stage === 'restoring'}
						class="focus-ring h-full shrink-0 px-4 {stylex.attrs(styles.submit).class}"
					>
						{@render label(false)}
					</button>
				</form>
			{/if}
		</div>

		<!-- One row under the pill in every state, so nothing below the section moves as it changes.
		The left slot carries whatever the reader most recently needs to know and falls back to the
		count; the right slot is the only place a destructive action appears. -->
		<div
			class="mt-3.5 flex items-baseline justify-between gap-6 pe-[calc(0.375rem_+_1px_-_var(--pill-overhang))] {stylex.attrs(
				styles.row,
			).class}"
		>
			{#if status === 'error'}
				<p class="selectable" role="alert">{m['newsletter.error']({}, { locale })}</p>
			{:else if status === 'cancelled'}
				<p class="selectable" role="status" class:returning={stage === 'restoring'}>
					{m['newsletter.unsubscribed']({}, { locale })}
				</p>
			{:else if status === 'confirmed'}
				<p
					class="selectable"
					role="status"
					class:arriving={entering}
					class:departing={stage === 'reverting'}
				>
					{m['newsletter.confirm']({}, { locale })}
				</p>
			{:else}
				<p class="selectable" class:leaving={entering}>
					<ParaglideMessage
						message={m['newsletter.subscribers']}
						inputs={{ count: subscribers }}
						options={{ locale }}
					>
						<!-- The cells are drawn rather than taken from the message's own text; the markup tag
						only records where a translator wants the number to sit. -->
						{#snippet cells()}
							<Counter value={subscribers} />
						{/snippet}
					</ParaglideMessage>
				</p>
			{/if}

			<!-- Held back until the sequence reaches it. A control that undoes what the reader is still
			watching happen has nothing to undo yet, and it arrives directly below the button they just
			pressed, where a second click would otherwise land on it. -->
			{#if subscription && stage !== 'redacting' && stage !== 'settling'}
				<!-- Centred under the button above, in a cell the button's own width decides.

				     That width is not a number anybody can write: it is the wider of two labels as
				     this font renders them, and it moves with the language. Measuring it would mean
				     painting at one position and shifting after hydration, which is the failure
				     spec/styling/rail.md records. So the cell reserves the width the same way the
				     button does, and the control centres inside it. -->
				<span class="under-chip inline-grid shrink-0 place-items-center">
					<span
						class="invisible col-start-1 row-start-1 px-4 whitespace-nowrap {stylex.attrs(
							styles.ghost,
						).class}"
						aria-hidden="true">{@render label(true)}</span
					>
					<button
						type="button"
						onclick={unsubscribe}
						disabled={cancellation.isPending || stage === 'reverting'}
						aria-busy={cancellation.isPending}
						class:arriving={stage === 'undoing'}
						class:departing={stage === 'reverting'}
						class="focus-link spring-underline col-start-1 row-start-1 {stylex.attrs(styles.undo)
							.class}"
					>
						{m['newsletter.unsubscribe']({}, { locale })}
					</button>
				</span>
			{/if}
		</div>
	</section>
{/if}

<style>
	/* Set on the section rather than on the pill, so the row below can measure from it too.
	   `.pill-metrics` above derives the radius and the overhang from this one number, and the two
	   rules under it read them back. A length arrived at through a cascade keeps being arrived at
	   that way, so the declaration stays where it was declared. See spec/todo.md. */
	section {
		--pill-height: 3.375rem;
	}

	/* The two halves of the pointer's account that need an ancestor to find their element. What
	   the pill and the chip say about themselves is a Tailwind class on each of them, in the
	   markup; a field and a button are reached through the pill they are inside, which is the one
	   thing neither of the other two layers can do. See spec/architecture/css/authoring.md. */
	.pill input {
		cursor: text;
	}

	/* Everything in this section that can be pressed says so, and nothing else does. The two here
	   are a `button` and a `button`, which browsers draw with an arrow; the inert chip above keeps
	   `not-allowed` because it is the one shaped like a control and is not one. */
	.pill button,
	.under-chip button {
		cursor: pointer;
	}

	.typed {
		animation: lift var(--typed-for) ease var(--typed-at) both;
	}

	.cooling {
		animation: cool var(--chip-for) var(--ease-spring) var(--chip-at) both;
	}

	.warming {
		animation: cool var(--back-chip-for) var(--ease-spring) var(--back-chip-at) both reverse;
	}

	@keyframes cool {
		from {
			background-color: var(--color-ink);
			color: var(--color-page);
		}
		to {
			background-color: var(--color-paper-hover);
			color: var(--color-text-soft);
		}
	}

	/* `spent` carries no declaration of its own any more -- the invisibility it named is a utility
	   on the same element, and `visibility` rather than `display` is still the whole point, because
	   the box has to keep measuring. What the class is for now is the two rules below, which reach
	   a child through a state on its parent and hand it a keyframe that paints it again. */
	.crossfading > span,
	.recrossing > span {
		animation-timing-function: var(--ease-spring);
		animation-fill-mode: both;
	}

	.crossfading > span {
		animation-duration: var(--chip-for);
		animation-delay: var(--chip-at);
	}

	.recrossing > span {
		animation-duration: var(--back-chip-for);
		animation-delay: var(--back-chip-at);
	}

	.crossfading > .spent,
	.recrossing > .spent {
		animation-name: spend;
	}

	.crossfading > :not(.spent),
	.recrossing > :not(.spent) {
		animation-name: take;
	}

	@keyframes spend {
		from {
			visibility: visible;
			opacity: 1;
		}
		to {
			visibility: visible;
			opacity: 0;
		}
	}

	@keyframes take {
		from {
			opacity: 0;
		}
	}

	/* The line under the pill: the count clears out, then the confirmation arrives in its place. */
	.leaving {
		animation: lift var(--count-for) ease var(--count-at) both;
	}

	.arriving {
		animation: arrive var(--row-for) var(--ease-spring) both;
	}

	button.arriving {
		animation-duration: var(--undo-for);
	}

	/* The line under the pill leaves along the path it arrived by, so the two states are visibly one
	   thing changing rather than two that happen to occupy the same row. */
	.departing {
		animation: arrive var(--back-undo-for) var(--ease-spring) var(--back-undo-at) both reverse;
	}

	.returning {
		animation: arrive var(--back-form-for) var(--ease-spring) both;
	}

	/* The button does not fade in with the rest: it is the shape the chip has just finished warming
	   back into, arriving at the same ink it was handed, and fading it would blink the one element
	   that was continuous across the swap. It springs instead -- the moment it can be pressed again
	   is worth marking; scale carries that without touching the colour that stayed continuous. */
	.reviving {
		animation: revive var(--back-form-for) var(--ease-spring) both;
	}

	@keyframes revive {
		from {
			transform: scale(0.92);
		}
	}

	@keyframes arrive {
		from {
			transform: translateY(0.375rem);
			opacity: 0;
		}
	}

	/* Uncovered left to right, so the address reads as being redacted in place. A clip needs no
	   measurement, unlike the Support rail's masks: that geometry depends on the rendered width of
	   two labels, and this one is always the whole box. See spec/styling/controls.md. */
	/* Not the spring. A spring is a settle: it spends 97% of the distance in the first half and
	   leaves the rest of the stage with nothing visibly happening. This sweep is meant to be
	   watched across its whole duration, so it eases in and out instead. */
	.revealing {
		animation: redact var(--redact-for) cubic-bezier(0.65, 0, 0.35, 1) var(--redact-at) both;
	}

	/* Not the sweep reversed. Redacting is something done to the address, edge and all; letting it
	   go is not, and a mirrored wipe would say the site was busy taking it back rather than simply
	   no longer holding it. So it goes soft instead of directional: blurred out of focus, drifting
	   very slightly, gone. */
	.dissolving {
		animation: dissolve var(--back-dissolve-for) ease-in var(--back-dissolve-at) both;
	}

	@keyframes dissolve {
		to {
			transform: translateX(0.5rem);
			opacity: 0;
			filter: blur(0.1875rem);
		}
	}

	@keyframes lift {
		to {
			transform: translateY(-0.375rem);
			opacity: 0;
		}
	}

	@keyframes redact {
		from {
			/* Vertical slack: an inset of zero would clip descenders against the line box. */
			clip-path: inset(-0.5rem 100% -0.5rem 0);
		}
		to {
			clip-path: inset(-0.5rem 0 -0.5rem 0);
		}
	}
</style>
