import { writeFileSync } from 'node:fs';
import { rustCanmi } from '../src/rust.ts';

writeFileSync(new URL('../src/lib.rs', import.meta.url), rustCanmi());
