/** What a command returns: the new value, or why it was refused, in the words the screen shows. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
