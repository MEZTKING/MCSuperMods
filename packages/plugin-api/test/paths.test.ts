import { describe, expect, it } from 'vitest';
import { assertProjectRelativePath, isProjectRelativePath } from '../src/index';

const accepted = ['msm.project.json', 'content/ns/thing/a.json', 'assets/ns/.keep'];
const rejected = ['', '/abs', 'a/../b', '..', 'a/./b', '.', 'a\\b', 'a//b', 'a/'];

describe('assertProjectRelativePath', () => {
  it.each(accepted)('accepts %j', (path) => {
    expect(() => assertProjectRelativePath(path)).not.toThrow();
  });

  it.each(rejected)('rejects %j', (path) => {
    expect(() => assertProjectRelativePath(path)).toThrow(Error);
  });

  it('names the offending path in its message', () => {
    expect(() => assertProjectRelativePath('/abs')).toThrow('"/abs"');
    expect(() => assertProjectRelativePath('')).toThrow('must not be empty');
  });
});

describe('isProjectRelativePath', () => {
  it.each(accepted)('accepts %j', (path) => {
    expect(isProjectRelativePath(path)).toBe(true);
  });

  it.each(rejected)('rejects %j', (path) => {
    expect(isProjectRelativePath(path)).toBe(false);
  });
});
