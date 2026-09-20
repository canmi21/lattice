<script lang="ts">
	import Article from '$lib/article/article.svelte';
	import ArticleBody from '$lib/article/body.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Collected notes leave the block stream here: they render after the article's closing
	// rule rather than inside the body, because they are apparatus about the article, not part
	// of it. See spec/styling/notes.md.
	const notes = $derived(
		data.body.blocks.flatMap((block) => (block.type === 'footnotes' ? block.notes : [])),
	);
</script>

<Article
	slug={data.slug}
	card={data.card}
	meta={data.meta}
	phone_title={data.body.phone_title}
	toc={data.body.toc}
	rail={data.rail}
	words={data.metrics.words}
	reads={data.reads}
	summary={data.body.summary}
	locale={data.locale}
	theme={data.theme}
	{notes}
>
	<ArticleBody blocks={data.body.blocks} resources={data.resources} locale={data.locale.code} />
</Article>
