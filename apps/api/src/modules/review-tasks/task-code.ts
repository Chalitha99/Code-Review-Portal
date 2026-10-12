/** Human-facing Task ID: normalized customer name plus a per-customer sequence. */
export function taskCodePrefix(customerName: string): string {
  const normalized = customerName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return normalized === '' ? 'TASK' : normalized;
}

export function formatTaskCode(customerName: string, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError('Task sequence must be a positive integer');
  }
  return `${taskCodePrefix(customerName)}-${String(sequence).padStart(2, '0')}`;
}
