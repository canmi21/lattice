/**
 * The Worker as deployed: the gateway, and the counter its limits are kept in. Apart from index.ts
 * so the tests, which cannot load `cloudflare:workers`, import the gateway alone.
 */
import { gateway } from './index.ts';

export { counter } from './counter.ts';

export default gateway();
