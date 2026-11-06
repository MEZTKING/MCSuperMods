import { describe, expect, it } from 'vitest';
import { ModrinthLookupError, modrinthProjectRef, resolveModrinthMod } from '../src/index';

const sodiumVersion = {
  id: 'VERSION1',
  version_number: '0.6.2+mc26.3',
  dependencies: [
    { project_id: 'P7dR8mSH', dependency_type: 'required' },
    { project_id: 'OPTIONAL', dependency_type: 'optional' },
  ],
  files: [
    {
      primary: false,
      filename: 'sources.jar',
      url: 'https://cdn.modrinth.com/s.jar',
      hashes: {},
      size: 1,
    },
    {
      primary: true,
      filename: 'sodium.jar',
      url: 'https://cdn.modrinth.com/data/AANobbMI/versions/VERSION1/sodium.jar',
      hashes: { sha1: 'a'.repeat(40), sha512: 'b'.repeat(128) },
      size: 42,
    },
  ],
};

function fakeModrinth(routes: Record<string, unknown>) {
  const asked: string[] = [];
  const download = async (url: string): Promise<Uint8Array> => {
    asked.push(url);
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (key === undefined) throw new Error(`GET ${url} returned HTTP 404.`);
    return new TextEncoder().encode(JSON.stringify(routes[key]));
  };
  return { download, asked };
}

describe('Modrinth lookups', () => {
  it('reads slugs, ids and links', () => {
    expect(modrinthProjectRef('sodium')).toBe('sodium');
    expect(modrinthProjectRef(' https://modrinth.com/mod/sodium/versions ')).toBe('sodium');
    expect(modrinthProjectRef('modrinth.com/mod/fabric-api')).toBe('fabric-api');
    expect(modrinthProjectRef('two words')).toBeNull();
    expect(modrinthProjectRef('')).toBeNull();
  });

  it('pins the primary file of the newest Fabric version for the game version', async () => {
    const { download, asked } = fakeModrinth({
      'https://api.modrinth.com/v2/project/sodium': {
        id: 'AANobbMI',
        title: 'Sodium',
        project_type: 'mod',
      },
      'https://api.modrinth.com/v2/project/AANobbMI/version?': [sodiumVersion],
    });
    const result = await resolveModrinthMod(
      download,
      'https://modrinth.com/mod/sodium',
      '9.9-msm-test',
    );
    expect(result.file).toEqual({
      projectId: 'AANobbMI',
      versionId: 'VERSION1',
      title: 'Sodium',
      fileName: 'sodium.jar',
      url: 'https://cdn.modrinth.com/data/AANobbMI/versions/VERSION1/sodium.jar',
      sha1: 'a'.repeat(40),
      sha512: 'b'.repeat(128),
      size: 42,
    });
    expect(result.versionNumber).toBe('0.6.2+mc26.3');
    expect(result.requiredProjects).toEqual(['P7dR8mSH']);
    expect(decodeURIComponent(asked[1] ?? '')).toContain(
      'loaders=["fabric"]&game_versions=["9.9-msm-test"]',
    );
  });

  it('explains unknown projects, non-mods and missing versions', async () => {
    const none = fakeModrinth({});
    await expect(resolveModrinthMod(none.download, 'nope', '9.9-msm-test')).rejects.toThrow(
      'Modrinth has no such project.',
    );
    const pack = fakeModrinth({
      'https://api.modrinth.com/v2/project/faithful': {
        id: 'X',
        title: 'Faithful',
        project_type: 'resourcepack',
      },
    });
    await expect(resolveModrinthMod(pack.download, 'faithful', '9.9-msm-test')).rejects.toThrow(
      /not a mod/,
    );
    const old = fakeModrinth({
      'https://api.modrinth.com/v2/project/old': { id: 'OLD', title: 'Old', project_type: 'mod' },
      'https://api.modrinth.com/v2/project/OLD/version?': [],
    });
    await expect(resolveModrinthMod(old.download, 'old', '9.9-msm-test')).rejects.toBeInstanceOf(
      ModrinthLookupError,
    );
    await expect(resolveModrinthMod(old.download, 'two words', '9.9-msm-test')).rejects.toThrow(
      /Enter/,
    );
  });
});
