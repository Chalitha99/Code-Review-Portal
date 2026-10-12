import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

// Tagged-template $queryRaw/$executeRaw are parameterised by Prisma; these forms are not.
const UNSAFE = [
  /\$(queryRaw|executeRaw)Unsafe\b/,
  /Prisma\.raw\(/,
  /\$(queryRaw|executeRaw)(<[^>]*>)?\(/,
];

describe('raw SQL guard (SQL injection)', () => {
  it('uses only parameterised raw queries', () => {
    const offenders = sourceFiles(srcDir).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return UNSAFE.filter((pattern) => pattern.test(text)).map(
        (pattern) => `${path.relative(srcDir, file)} matches ${String(pattern)}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
