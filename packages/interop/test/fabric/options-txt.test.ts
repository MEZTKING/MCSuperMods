import { describe, expect, it } from 'vitest';
import { DEV_RESOURCE_PACK_ID, readResourcePacks, withResourcePack } from '../../src/index';

const PACK = DEV_RESOURCE_PACK_ID;

describe('withResourcePack', () => {
  it('creates a file holding only the line when there is none', () => {
    expect(withResourcePack(null, PACK)).toBe(
      'resourcePacks:["vanilla","fabric","file/msm-dev"]\n',
    );
    expect(withResourcePack('', PACK)).toBe('resourcePacks:["vanilla","fabric","file/msm-dev"]\n');
  });

  it('appends the pack last and changes only that line', () => {
    const text = 'version:4700\nresourcePacks:["vanilla","fabric","file/mine.zip"]\nfov:0.5\n';
    expect(withResourcePack(text, PACK)).toBe(
      'version:4700\nresourcePacks:["vanilla","fabric","file/mine.zip","file/msm-dev"]\nfov:0.5\n',
    );
  });

  it('moves an earlier copy to the end and removes duplicates', () => {
    const text = 'resourcePacks:["vanilla","file/msm-dev","file/mine.zip","file/msm-dev"]\n';
    expect(withResourcePack(text, PACK)).toBe(
      'resourcePacks:["vanilla","file/mine.zip","file/msm-dev"]\n',
    );
  });

  it('returns the text unchanged when the pack is already last', () => {
    const text = 'a:1\r\nresourcePacks:[ "vanilla", "file/msm-dev" ]\r\nb:2';
    expect(withResourcePack(text, PACK)).toBe(text);
  });

  it('keeps CRLF line endings and a missing final newline', () => {
    const text = 'version:4700\r\nresourcePacks:[]\r\nfov:0.5';
    expect(withResourcePack(text, PACK)).toBe(
      'version:4700\r\nresourcePacks:["file/msm-dev"]\r\nfov:0.5',
    );
  });

  it("adds the line at the end when it is missing, with the file's line ending", () => {
    expect(withResourcePack('version:4700\r\nfov:0.5\r\n', PACK)).toBe(
      'version:4700\r\nfov:0.5\r\nresourcePacks:["vanilla","fabric","file/msm-dev"]\r\n',
    );
    expect(withResourcePack('version:4700', PACK)).toBe(
      'version:4700\nresourcePacks:["vanilla","fabric","file/msm-dev"]\n',
    );
  });

  it('rewrites an unreadable list with the defaults', () => {
    expect(withResourcePack('resourcePacks:[vanilla\nx:1\n', PACK)).toBe(
      'resourcePacks:["vanilla","fabric","file/msm-dev"]\nx:1\n',
    );
  });

  it('leaves look-alike keys alone', () => {
    const text = 'incompatibleResourcePacks:[]\nresourcePacksX:1\n';
    expect(withResourcePack(text, PACK)).toBe(
      'incompatibleResourcePacks:[]\nresourcePacksX:1\nresourcePacks:["vanilla","fabric","file/msm-dev"]\n',
    );
  });
});

describe('readResourcePacks', () => {
  it('reads the list or says there is none', () => {
    expect(readResourcePacks(null)).toBeNull();
    expect(readResourcePacks('x:1\n')).toBeNull();
    expect(readResourcePacks('resourcePacks:["vanilla"]\r\n')).toEqual(['vanilla']);
  });
});
