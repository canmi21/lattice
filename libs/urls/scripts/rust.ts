import { writeFileSync } from 'node:fs';
import { rustUrlMap } from '../src/rust.ts';

writeFileSync(new URL('../src/lib.rs', import.meta.url), rustUrlMap());
