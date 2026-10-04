import { PUBLISHED, RESOLVED } from '../../cache/src/index.ts';
import { expect, it } from 'vitest';
import { followSymlink, marksOf, serveSymlink } from './index';

const NAME = 'https://alias.example/symlink/favicon.ico';
const replying = (response: Response | Error): typeof fetch =>
	(async () => {
		if (response instanceof Error) throw response;
		return response;
	}) as typeof fetch;

it('hands the browser where the name points, in one hop', async () => {
	const target = 'https://cdn.example/object/abc.ico';
	const res = await followSymlink(
		NAME,
		replying(new Response(null, { status: 302, headers: { Location: target } })),
	);
	expect(res.status).toBe(302);
	expect(res.headers.get('Location')).toBe(target);
	expect(res.headers.get('Cache-Control')).toBe(RESOLVED);
});

it('resolves a relative target against the name', async () => {
	const res = await followSymlink(
		NAME,
		replying(new Response(null, { status: 302, headers: { Location: '/object/abc.ico' } })),
	);
	expect(res.headers.get('Location')).toBe('https://alias.example/object/abc.ico');
});

it('keeps a miss as long as the corpus does', async () => {
	const res = await followSymlink(NAME, replying(new Response(null, { status: 404 })));
	expect(res.status).toBe(404);
	expect(res.headers.get('Cache-Control')).toBe(PUBLISHED);
});

it('keeps nothing of a failure', async () => {
	for (const failed of [new Response(null, { status: 503 }), new Error('down')]) {
		const res = await followSymlink(NAME, replying(failed));
		expect(res.status).toBe(502);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	}
});

it('names each mark by the object it resolves to, and leaves out what resolves to nothing', async () => {
	const fetcher = (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith('/missing.png')) return new Response(null, { status: 404 });
		return new Response(null, {
			status: 302,
			headers: { Location: `https://cdn.example/object/${url.split('/').pop()}` },
		});
	}) as typeof fetch;
	const marks = await marksOf('https://alias.example', 'test', ['a.svg', 'missing.png'], fetcher);
	expect(marks).toEqual({ 'a.svg': 'https://cdn.example/object/a.svg' });
});

it('answers the bytes a name stands for from the asking origin, typed as asked', async () => {
	const fetcher = (async (input: RequestInfo | URL) =>
		String(input) === NAME
			? new Response(null, {
					status: 302,
					headers: { Location: 'https://cdn.example/object/a.xsl' },
				})
			: new Response('<xsl/>', { status: 200 })) as typeof fetch;
	const res = await serveSymlink(NAME, 'text/xsl', fetcher);
	expect(res.status).toBe(200);
	expect(res.headers.get('Content-Type')).toBe('text/xsl');
	expect(res.headers.get('Cache-Control')).toBe(RESOLVED);
	expect(await res.text()).toBe('<xsl/>');
});

it('passes a miss through rather than serving it', async () => {
	const res = await serveSymlink(NAME, 'text/xsl', replying(new Response(null, { status: 404 })));
	expect(res.status).toBe(404);
});
