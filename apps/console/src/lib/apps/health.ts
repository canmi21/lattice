/**
 * The database's health on each node, as host asks the keeper for it: platform's
 * spec/architecture/databases.md, "The container is Postgres and a keeper of it". Read
 * defensively, since the keeper and host are deployed apart from the console: a field it does not
 * know is passed over, and one missing is unknown, never a guess. Pure, so the server and the
 * browser read an answer the same and every case is tested apart from the markup.
 */
import type { Checked } from '../host.ts';
import type { Node } from '../server/nodes.ts';
import type { Read } from '../server/read.ts';
import type { Tone } from '../style.ts';

/** The one app whose page draws the keeper's health. */
export const DATABASE = 'database';

/** Each node's answer, the nodes that run the app among them. */
export type HealthReads = Partial<Record<Node, Read<Checked>>>;

export interface Standby {
	name: string;
	/** Postgres's word for the connection, `streaming` when well. */
	state?: string;
	lag_bytes?: number;
}

export interface Backup {
	/** `ok`, `stopped` or `unknown`: whether backing up goes on at all. */
	state?: string;
	/** `ok`, `stalled` or `unknown`: whether finished segments leave for the bucket. */
	archiving?: string;
	oldest_waiting?: string;
	oldest_waiting_seconds?: number;
	last_base_backup?: string;
	last_base_backup_age_hours?: number;
}

/** What one keeper says: the primary's half or a standby's, whichever it is. */
export interface Keeper {
	/** What the server is: `primary` or `standby`. */
	role?: string;
	/** What the node was told to be. */
	configured?: string;
	standbys?: Standby[];
	backup?: Backup;
	streaming?: boolean;
	lag_bytes?: number;
	lag_seconds?: number;
}

export type Health =
	| { kind: 'keeper'; keeper: Keeper; checked_at?: string }
	/** The app answered, but not well: a keeper not yet ready says why. */
	| { kind: 'unwell'; message: string; code?: string; status?: number; checked_at?: string }
	/** Host asked, and the app did not answer. */
	| { kind: 'silent'; error: string; checked_at?: string }
	/** Host has no such route yet. */
	| { kind: 'unavailable' }
	/** Host does not run the app. */
	| { kind: 'absent' }
	/** Host itself could not be read. */
	| { kind: 'unread'; message: string; code: string };

type Fields = Record<string, unknown>;

const fields = (value: unknown): Fields | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Fields)
		: undefined;
const word = (value: unknown): string | undefined =>
	typeof value === 'string' && value !== '' ? value : undefined;
const figure = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const flag = (value: unknown): boolean | undefined =>
	typeof value === 'boolean' ? value : undefined;

function standbyOf(value: unknown): Standby | undefined {
	const one = fields(value);
	const name = word(one?.name);
	return one && name
		? { name, state: word(one.state), lag_bytes: figure(one.lag_bytes) }
		: undefined;
}

function backupOf(value: unknown): Backup | undefined {
	const one = fields(value);
	if (!one) return undefined;
	return {
		state: word(one.state),
		archiving: word(one.archiving),
		oldest_waiting: word(one.oldest_waiting),
		oldest_waiting_seconds: figure(one.oldest_waiting_seconds),
		last_base_backup: word(one.last_base_backup),
		last_base_backup_age_hours: figure(one.last_base_backup_age_hours),
	};
}

/** A keeper's `data`, each field kept only where it is the kind it should be. */
export function keeperOf(data: Fields): Keeper {
	return {
		role: word(data.role),
		configured: word(data.configured),
		standbys: Array.isArray(data.standbys)
			? data.standbys.flatMap((one) => standbyOf(one) ?? [])
			: undefined,
		backup: backupOf(data.backup),
		streaming: flag(data.streaming),
		lag_bytes: figure(data.lag_bytes),
		lag_seconds: figure(data.lag_seconds),
	};
}

/** The app's own answer, which is the keeper's envelope. */
function answerOf(checked: Fields, checked_at: string | undefined): Health {
	const status = figure(checked.code);
	const body = fields(checked.body);
	const data = fields(body?.data);
	if (body?.status === 'success' && data)
		return { kind: 'keeper', keeper: keeperOf(data), checked_at };
	if (body?.status === 'error') {
		const message = word(body.message) ?? 'The keeper answered with an error.';
		return { kind: 'unwell', message, code: word(body.code), status, checked_at };
	}
	const message = `Answered ${status ?? 'without a status'} outside the envelope.`;
	return { kind: 'unwell', message, status, checked_at };
}

/** One node's read of `/api/apps/{name}/health`, or none where it was not asked. */
export function healthOf(read: Read<unknown> | undefined): Health {
	if (!read) return { kind: 'unread', message: 'Not asked.', code: 'upstream_unavailable' };
	if (!read.ok) {
		const { status, code, message } = read.failure;
		if (status === 404)
			return code === 'no_such_app' ? { kind: 'absent' } : { kind: 'unavailable' };
		return { kind: 'unread', message, code };
	}
	const checked = fields(read.data);
	if (!checked)
		return {
			kind: 'unread',
			message: 'Host answered nothing to read.',
			code: 'upstream_unavailable',
		};
	const checked_at = word(checked.checked_at);
	if (checked.answered !== true) {
		return { kind: 'silent', error: word(checked.error) ?? 'Did not answer.', checked_at };
	}
	return answerOf(checked, checked_at);
}

/** Whether the server is not what its node was told to be; unknown on either side is not. */
export const mismatched = (keeper: Keeper): boolean =>
	keeper.role !== undefined && keeper.configured !== undefined && keeper.role !== keeper.configured;

/** The nodes whose server is the primary, which is one when all is well. */
export const primaries = (healths: [Node, Health][]): Node[] =>
	healths.flatMap(([node, health]) =>
		health.kind === 'keeper' && health.keeper.role === 'primary' ? [node] : [],
	);

/** Whether backing up has stopped, said by the primary: platform's spec/issues/scheduling.md. */
export const stopped = (keeper: Keeper): boolean => keeper.backup?.state === 'stopped';

/** The words a keeper uses for its backup, archiving and standbys, each in its tone. */
export function toneOf(state: string | undefined): Tone {
	if (state === 'ok' || state === 'streaming') return 'good';
	if (state === 'stopped') return 'bad';
	if (state === undefined || state === 'unknown') return 'quiet';
	return 'warn';
}

/** A keeper's word as a reader reads it: `Stalled`, and `Unknown` for none. */
export const said = (state: string | undefined): string =>
	state === undefined
		? 'Unknown'
		: state === 'ok'
			? 'OK'
			: state.charAt(0).toUpperCase() + state.slice(1);

/** A span the keeper gives in hours, as long as a glance needs: `40 min`, `3.2 h`, `4 days`. */
export function age(hours: number): string {
	if (hours < 1) return `${Math.round(hours * 60)} min`;
	if (hours < 48) return `${hours.toFixed(1).replace(/\.0$/, '')} h`;
	return `${Math.round(hours / 24)} days`;
}
