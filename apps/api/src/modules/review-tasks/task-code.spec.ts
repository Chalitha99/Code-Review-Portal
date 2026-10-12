import { describe, expect, it } from 'vitest';
import { formatTaskCode, taskCodePrefix } from './task-code.js';

describe('task code formatting', () => {
  it('uses the normalized customer name and a two-digit minimum sequence', () => {
    expect(formatTaskCode('Sample Customer', 1)).toBe('SAMPLECUSTOMER-01');
    expect(formatTaskCode('Sample Customer', 12)).toBe('SAMPLECUSTOMER-12');
    expect(formatTaskCode('Sample Customer', 123)).toBe('SAMPLECUSTOMER-123');
  });

  it('normalizes spaces and punctuation in customer names', () => {
    expect(taskCodePrefix(' Sample Customer (Test) ')).toBe('SAMPLECUSTOMERTEST');
  });

  it('rejects invalid sequences', () => {
    expect(() => formatTaskCode('Sample Customer', 0)).toThrow(RangeError);
  });
});
