/** Format for the software version assigned to a QA task (not document revisions). */
export const TASK_VERSION_PATTERN = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/;
const GROUP_LENGTHS = [2, 2, 2, 4] as const;

/** Insert separators as digits are typed without inventing missing digits. */
export function formatTaskVersionInput(value: string): string {
  const input = value.replace(/^\s*v\.?\s*/i, "");
  // Preserve explicitly separated, short segments until blur.
  if (/^\d{1,2}(?:\.\d{1,2}){2}\.\d{1,4}$/.test(input)) return input;
  const digits = input.replace(/\D/g, "").slice(0, 10);
  const parts: string[] = [];
  let index = 0;
  for (const length of GROUP_LENGTHS) {
    const part = digits.slice(index, index + length);
    if (!part) break;
    parts.push(part);
    index += length;
  }
  return parts.join(".");
}

/** Finalize a user/AI/imported version as 00.00.00.0000.
 * Omitted segments default to zero; a short build segment is left-padded.
 * Reject non-numeric content by returning it unchanged for schema validation.
 */
export function normalizeTaskVersion(value: string): string {
  const input = value.trim().replace(/^v\.?\s*/i, "");
  if (!input) return "";
  const dotted = /^\d{1,2}(?:\.\d{1,2}){0,2}(?:\.\d{1,4})?$/;
  if (!/^\d{1,10}$/.test(input) && !dotted.test(input)) return input;
  const parts = input.includes(".")
    ? input.split(".")
    : formatTaskVersionInput(input).split(".");
  return GROUP_LENGTHS.map((size, index) =>
    (parts[index] || "0").padStart(size, "0")
  ).join(".");
}
