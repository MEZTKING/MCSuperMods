import { describe, expect, it } from 'vitest';
import {
  assertProjectRelativePath,
  createElement,
  elementFilePath,
  mediaTypeForPath,
} from '../src/index';
import { fixedNow } from './helpers/kinds';

describe('assertProjectRelativePath', () => {
  it.each(['msm.project.json', 'content/ns/thing/a.json', 'assets/ns/.keep'])(
    'accepts %j',
    (path) => {
      expect(() => assertProjectRelativePath(path)).not.toThrow();
    },
  );

  it.each(['', '/abs', 'a/../b', '..', 'a/./b', '.', 'a\\b', 'a//b', 'a/'])(
    'rejects %j',
    (path) => {
      expect(() => assertProjectRelativePath(path)).toThrow();
    },
  );
});

describe('layout helpers', () => {
  it('builds element file paths', () => {
    const element = createElement({ id: 'ns:a/b', kind: 'test:thing', data: {}, now: fixedNow });
    expect(elementFilePath(element, 'thing')).toBe('content/ns/thing/a/b.json');
    expect(elementFilePath(element, 'msm/block')).toBe('content/ns/msm/block/a/b.json');
  });

  it('maps extensions to media types', () => {
    expect(mediaTypeForPath('textures/a.png')).toBe('image/png');
    expect(mediaTypeForPath('sounds/a.OGG')).toBe('audio/ogg');
    expect(mediaTypeForPath('a.json')).toBe('application/json');
    expect(mediaTypeForPath('structures/a.nbt')).toBe('application/x-minecraft-nbt');
    expect(mediaTypeForPath('models/a.bbmodel')).toBe('application/json');
    expect(mediaTypeForPath('a.bin')).toBe('application/octet-stream');
    expect(mediaTypeForPath('dir.png/noext')).toBe('application/octet-stream');
  });
});
