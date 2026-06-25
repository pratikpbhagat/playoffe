const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a string is a well-formed UUID. Use before interpolating any ID
 * into a hand-built PostgREST filter string (`.or()`, etc.) — those don't
 * parameterize, so a malformed value can break out of the filter syntax.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
