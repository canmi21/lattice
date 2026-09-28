/**
 * A job's schedule in the reader's own words, when the pattern is plain enough to say without a
 * parser: a fixed daily time, or a round `every`. Anything else is left to the expression itself.
 * See spec/architecture/cron.md, "A job is declared by the service that does it".
 */

const EVERY_UNIT: Record<'s' | 'm' | 'h', string> = { s: 'second', m: 'minute', h: 'hour' };

export function scheduleHint(cron: string | null, every: string | null): string | undefined {
	if (every) {
		const match = /^(\d+)(s|m|h)$/.exec(every);
		if (!match) return undefined;
		const count = Number(match[1]);
		const unit = EVERY_UNIT[match[2] as 's' | 'm' | 'h'];
		return `every ${count} ${unit}${count === 1 ? '' : 's'}`;
	}
	if (cron) {
		const fields = cron.trim().split(/\s+/);
		if (fields.length !== 5) return undefined;
		const [minute, hour, day, month, weekday] = fields;
		if (
			day === '*' &&
			month === '*' &&
			weekday === '*' &&
			/^\d{1,2}$/.test(minute!) &&
			/^\d{1,2}$/.test(hour!)
		) {
			return `daily at ${hour!.padStart(2, '0')}:${minute!.padStart(2, '0')} UTC`;
		}
	}
	return undefined;
}
