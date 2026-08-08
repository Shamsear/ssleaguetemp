/**
 * Normalize a string for accent-insensitive search.
 * Strips diacritics (é→e, ö→o, ü→u, etc.) and lowercases.
 * Use this everywhere you compare user search input against player/team names.
 *
 * @example
 * normalizeStr("Özil") // "ozil"
 * normalizeStr("Hernández") // "hernandez"
 */
export function normalizeStr(str: string | null | undefined): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
