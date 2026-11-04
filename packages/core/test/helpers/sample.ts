import type { Project } from '../../src/index';
import { createElement, createEmptyProject } from '../../src/index';
import { fixedNow } from './kinds';

/** Two namespaces, three elements of `test:thing` (one nested path), one asset. */
export function sampleProject(): Project {
  const project = createEmptyProject('Sample', { targets: ['mc-1.0'], plugins: ['test.things'] });
  project.settings = { 'export.zip': true };
  project.namespaces = [
    {
      name: 'alpha',
      elements: [
        createElement({
          id: 'alpha:gadgets/widget',
          kind: 'test:thing',
          data: { colour: 'red', size: 3, parts: ['a', 'b'] },
          now: fixedNow,
          notes: 'Nested path.',
          tags: ['demo'],
        }),
        createElement({
          id: 'alpha:sprocket',
          kind: 'test:thing',
          data: { teeth: 12 },
          now: fixedNow,
        }),
      ],
      assets: [{ path: 'textures/thing.png', mediaType: 'image/png' }],
    },
    {
      name: 'beta',
      elements: [
        createElement({
          id: 'beta:gear',
          kind: 'test:thing',
          data: { nested: { z: 1, a: [] } },
          now: fixedNow,
        }),
      ],
      assets: [],
    },
  ];
  return project;
}
