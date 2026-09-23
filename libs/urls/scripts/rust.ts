import { writeFileSync } from 'node:fs';
import { rustUrlMap } from '../src/rust.ts';

writeFileSync(new URL('../../../apps/local/src/urls.rs', import.meta.url), rustUrlMap());
