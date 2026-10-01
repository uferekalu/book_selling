/**
 * Baseline: marks the schema as of BS-5 as the starting point. Indexes are declared on the
 * Mongoose schemas and built on boot (`autoIndex`), so there is nothing to change here; later
 * migrations handle renames, type changes and backfills (docs/ENGINEERING_RULES.md §4).
 */
export const up = async () => {};

export const down = async () => {};
