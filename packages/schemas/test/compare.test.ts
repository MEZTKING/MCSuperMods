import { describe, expect, it } from 'vitest';
import { compareGameVersions, isVersionInRange } from '../src/index';

describe('compareGameVersions', () => {
  it('orders numeric tuples', () => {
    const ordered = ['1.9', '1.20', '1.20.5', '1.21.9', '25.1', '25.3', '25.3.1', '100.0'];
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i] as string;
      const b = ordered[i + 1] as string;
      expect(compareGameVersions(a, b), `${a} < ${b}`).toBe(-1);
      expect(compareGameVersions(b, a), `${b} > ${a}`).toBe(1);
    }
  });

  it('treats equal versions and missing zero segments as equal', () => {
    expect(compareGameVersions('1.0', '1.0')).toBe(0);
    expect(compareGameVersions('1.0', '1.0.0')).toBe(0);
    expect(compareGameVersions('2.0.0', '2.0')).toBe(0);
  });

  it('sorts non-numeric segments after numeric ones, as strings', () => {
    expect(compareGameVersions('1.0.1', '1.0.a')).toBe(-1);
    expect(compareGameVersions('1.0-pre1', '1.0-pre2')).toBe(-1);
    expect(compareGameVersions('1.0', '1.0-pre1')).toBe(-1);
  });
});

describe('isVersionInRange', () => {
  it('treats since as inclusive and until as exclusive', () => {
    expect(isVersionInRange('1.0', '1.0', '2.0')).toBe(true);
    expect(isVersionInRange('1.9.9', '1.0', '2.0')).toBe(true);
    expect(isVersionInRange('2.0', '1.0', '2.0')).toBe(false);
    expect(isVersionInRange('0.9', '1.0', '2.0')).toBe(false);
  });

  it('treats absent bounds as unbounded', () => {
    expect(isVersionInRange('1.0')).toBe(true);
    expect(isVersionInRange('0.1', undefined, '1.0')).toBe(true);
    expect(isVersionInRange('1.0', undefined, '1.0')).toBe(false);
    expect(isVersionInRange('9.0', '1.0')).toBe(true);
  });
});
