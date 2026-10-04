/**
 * The Worker as deployed. Apart from index.ts so the tests, which load no Worker's runtime, import
 * the gateway alone.
 */
import { gateway } from './index.ts';

export default gateway();
