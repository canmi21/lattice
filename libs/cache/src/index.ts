/**
 * How long an answer from this site may be kept.
 *
 * Publication has one delay rather than a different one per resource, so the number saying
 * what that delay is belongs in one place rather than in each worker that stamps it -- three
 * of them wrote it out, and two that drifted apart would be two answers to one question. See
 * spec/architecture/delivery.md and spec/architecture/artifacts.md, "The key says what may
 * cache it".
 *
 * Only the values are here. Which answer earns which lifetime stays with the worker that knows,
 * because the three do three different jobs, and one policy deciding for all of them would be
 * one place holding three unrelated decisions.
 */

/** Five minutes, in seconds. How far behind the current publication an answer may be. */
export const PUBLICATION_DELAY = 300;

/** One year, in seconds: the longest a browser honours, and what `immutable` already implies. */
const UNCHANGING_LIFE = 31_536_000;

/**
 * Three hours, in seconds, for a caller that decides its answer is worth serving stale.
 *
 * A root that old names objects that are all still there and still immutable, so what it renders
 * is a coherent older page rather than a broken one. Whether an answer may be served during an
 * outage is a fact about what produced it, so that decision stays where it is made and only the
 * window is shared.
 */
export const WHILE_UNREACHABLE = 10_800;

/**
 * What an answer about what is published right now earns.
 *
 * Its key names rather than identifies, so the bytes behind it change when somebody publishes
 * and it is held for exactly the delay publication has. Refusals included: a 404 about the
 * corpus and a 400 about an address are both true until the next publication, and giving either
 * a number of its own would be a second publication delay.
 */
export const PUBLISHED = `public, max-age=${PUBLICATION_DELAY}`;

/**
 * What a key whose bytes cannot change earns.
 *
 * Content addressing is the usual reason -- a hashed name cannot denote different bytes, so a
 * cached copy is correct forever and needs no invalidation. It is not the only one: a Latin font
 * subset keeps the year on a written promise that re-subsetting renames it, which is why this is
 * named for the property rather than for the hash that normally carries it.
 */
export const UNCHANGING = `public, max-age=${UNCHANGING_LIFE}, immutable`;
