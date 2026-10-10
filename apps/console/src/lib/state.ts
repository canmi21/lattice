/**
 * The two records the console keeps in the browser, declared as data on its own origin;
 * `@canmi/kit/behavior/state` executes them. See spec/console/state.md for which facts go in
 * which, and the lib's spec/kit/state.md for the mechanism.
 */
import { record } from '@canmi/kit/behavior/state';

/** What is true of the person. Pair it with `localStorage`. */
export const reader = record('state', []);

/** What is true of this sitting. Pair it with `sessionStorage`. */
export const tab = record('state', []);
