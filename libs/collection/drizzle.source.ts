// Two configs and two output directories, because they are two databases: a migration is only
// ever run against the file whose schema generated it. See src/derived.ts for why they are split.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/source.ts',
	out: './drizzle/source',
	migrations: { prefix: 'index' },
});
