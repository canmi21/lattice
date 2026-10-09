<script lang="ts">
	/**
	 * The keyboard's first stop, past the shell to the page: out of sight until it is focused. See
	 * spec/console/design.md, "Accessibility".
	 */
	import * as stylex from '@stylexjs/stylex';
	import { radius, text, weight } from '@canmi/kit/tokens/vocabulary.stylex';

	const styles = stylex.create({
		link: {
			borderRadius: radius.md,
			backgroundColor: 'var(--color-surface)',
			color: 'var(--color-text-strong)',
			fontSize: text.px14,
			fontWeight: weight.medium,
		},
	});
</script>

<a
	href="#content"
	class="fixed top-2 left-2 z-50 -translate-y-16 px-3 py-1.5 focus:translate-y-0 {stylex.attrs(
		styles.link,
	).class}">Skip to content</a
>
