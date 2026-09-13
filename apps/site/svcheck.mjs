import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
const file = process.argv[2];
try {
  const r = compile(readFileSync(file, 'utf8'), { filename: file, generate: 'server' });
  const w = r.warnings.filter((x) => !/a11y/.test(x.code ?? ''));
  console.log(`OK  ${file}  warnings: ${r.warnings.length} (${w.length} non-a11y)`);
  for (const x of w.slice(0, 3)) console.log(`    ${x.code}: ${x.message}`);
} catch (e) {
  console.log(`FAIL ${file}\n    ${e.message}`);
  process.exit(1);
}
