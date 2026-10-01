/**
 * A page as an agent reads it: everything the page shows a person, and what it only implies, laid
 * out as markdown sections, each saying where its data came from and when. See
 * spec/architecture/markdown.md.
 */
import type { TocEntry } from '@canmi/artifacts/types';

/** A time as the document states it: ISO 8601 in UTC, to the second. */
export function stamp(at: Date | string): string {
	return new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A table cell: one line, its pipes escaped. */
function cell(value: string | number): string {
	return String(value).replace(/\s*\n\s*/g, ' ').replaceAll('|', '\\|');
}

/** A two-column table of fields, rows without a value left out. */
export function fields(rows: readonly (readonly [string, string | number | undefined])[]): string {
	const kept = rows.filter((row): row is readonly [string, string | number] => row[1] !== undefined);
	return ['| Field | Value |', '| --- | --- |', ...kept.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`)]
		.join('\n');
}

/** A table with a header row. */
export function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
	return [
		`| ${head.map(cell).join(' | ')} |`,
		`| ${head.map(() => '---').join(' | ')} |`,
		...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
	].join('\n');
}

const FENCE = /^\s*(```|~~~)/;
const FRONT_MATTER = /^---\n[\s\S]*?\n---\n/;

/**
 * A compiled source as the body of a section: its front matter and its title gone -- the
 * sections above say both -- the paragraph that only repeats `description` gone, and every heading
 * one level deeper, code left alone.
 */
export function bodyOf(markdown: string, description?: string): string {
	const lines = markdown.replace(FRONT_MATTER, '').replace(/^\s+/, '').split('\n');
	if (lines[0]?.startsWith('# ')) lines.shift();
	while (lines[0]?.trim() === '') lines.shift();
	if (lines[0]?.startsWith('> ')) lines.shift();
	else if (description && lines[0]?.trim() === description.trim()) lines.shift();
	let fenced = false;
	return lines
		.map((line) => {
			if (FENCE.test(line)) fenced = !fenced;
			return !fenced && /^#{1,5} /.test(line) ? `#${line}` : line;
		})
		.join('\n')
		.trim();
}

/** A table of contents as a nested list, each entry linking to its heading on the page. */
export function contents(toc: readonly TocEntry[], page: string): string {
	const top = Math.min(...toc.map((entry) => entry.depth));
	return toc
		.map((entry) => `${'  '.repeat(entry.depth - top)}- [${entry.text}](${page}#${entry.slug})`)
		.join('\n');
}

/** The opening every view shares: what it is, when it was made, where the page is, and the rule. */
export function opening(title: string, page: string, now: Date, notice: string): string {
	return [
		`# ${title}`,
		'',
		`> This is the agent view of ${page}, generated ${stamp(now)}. The same page for humans is the address without \`.md\`.`,
		'>',
		'> Every page on this site has its agent view at its own address with `.md` appended, so ask for that address directly.',
		'',
		notice,
	].join('\n');
}

/** A section: a heading, where its data came from, and the data. */
export function section(heading: string, source: string | undefined, content: string): string {
	return [`## ${heading}`, '', ...(source ? [`> ${source}`, ''] : []), content].join('\n');
}

/** The structured data the HTML carries, for a reader that parses rather than reads. */
export function structured(graph: unknown): string {
	return section(
		'Structured data',
		'The JSON-LD graph the page for humans carries.',
		`\`\`\`json\n${JSON.stringify(graph, null, 2)}\n\`\`\``,
	);
}
