// Generates SQL only; nothing here ever opens a connection. The probe applies the output with
// sqlx, so plain ordered .sql files are the contract -- see spec/architecture/probe.md.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/schema.ts',
	out: './migrations',
});
