import { describe, expect, it } from 'vitest';
import { createMemoryFileSystem, loadProject, saveProject } from '../src/index';
import { fixturePath, readFixture } from './helpers/disk';
import { testRegistry } from './helpers/kinds';
import { sampleProject } from './helpers/sample';

// Fixtures are golden files: update them only on an intentional format change.
describe.each(['empty-project', 'sample-project'])('golden fixture %s', (name) => {
  const fixture = readFixture(fixturePath(name));

  it('saves back to identical bytes in place', async () => {
    const fs = createMemoryFileSystem(fixture);
    const registry = testRegistry();
    const { problems } = await loadProject(fs, registry);
    expect(problems).toEqual([]);
    await saveProject(fs, (await loadProject(fs, registry)).project, registry);
    expect(fs.snapshot()).toEqual(fixture);
  });

  it('saves every JSON file to identical bytes in a fresh file system', async () => {
    const registry = testRegistry();
    const { project } = await loadProject(createMemoryFileSystem(fixture), registry);
    const fresh = createMemoryFileSystem();
    await saveProject(fresh, project, registry);
    const expected = Object.fromEntries(
      Object.entries(fixture).filter(([path]) => path.endsWith('.json')),
    );
    expect(fresh.snapshot()).toEqual(expected);
  });
});

describe('sample-project fixture', () => {
  it('matches the sample project model', async () => {
    const fs = createMemoryFileSystem(readFixture(fixturePath('sample-project')));
    const { project } = await loadProject(fs, testRegistry());
    expect(project).toEqual(sampleProject());
  });
});
