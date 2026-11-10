// Legacy pages use the same release/TF version mask as the React app.
// Document revision numbers (post versions) are intentionally excluded.
export const TASK_VERSION_PATTERN = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/;
const lengths = [2, 2, 2, 4];

export function formatTaskVersionInput(value) {
  const input = String(value ?? '').replace(/^\s*v\.?\s*/i, '');
  if (/^\d{1,2}(?:\.\d{1,2}){2}\.\d{1,4}$/.test(input)) return input;
  const digits = input.replace(/\D/g, '').slice(0, 10);
  const parts = [];
  let index = 0;
  for (const length of lengths) {
    const part = digits.slice(index, index + length);
    if (!part) break;
    parts.push(part);
    index += length;
  }
  return parts.join('.');
}

export function normalizeTaskVersion(value) {
  const input = String(value ?? '').trim().replace(/^v\.?\s*/i, '');
  if (!input) return '';
  const dotted = /^\d{1,2}(?:\.\d{1,2}){0,2}(?:\.\d{1,4})?$/;
  if (!/^\d{1,10}$/.test(input) && !dotted.test(input)) return input;
  const parts = input.includes('.') ? input.split('.') : formatTaskVersionInput(input).split('.');
  if (parts.length > lengths.length ||
      parts.some((part, index) => part.length > lengths[index])) return input;
  return lengths.map((length, index) => (parts[index] || '0').padStart(length, '0')).join('.');
}

export function wireTaskVersionInput(input) {
  if (!input || input.dataset.qaVersionMask === 'true') return;
  input.dataset.qaVersionMask = 'true';
  input.maxLength = 13;
  input.inputMode = 'numeric';
  input.placeholder = '00.00.00.0000';
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    input.value = formatTaskVersionInput(input.value);
  });
  input.addEventListener('blur', () => {
    input.value = normalizeTaskVersion(input.value);
  });
}
