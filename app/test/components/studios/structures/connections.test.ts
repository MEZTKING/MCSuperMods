import type { Json, Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  normaliseId,
  poolConnections,
  poolLocations,
  templateJigsaws,
} from '../../../../src/renderer/src/studios/structures/connections';
import { element } from '../../fixtures';

const pool = (...locations: string[]): Json => ({
  fallback: 'minecraft:empty',
  elements: locations.map((location) => ({
    weight: 1,
    element: {
      element_type: 'minecraft:single_pool_element',
      location,
      processors: 'minecraft:empty',
      projection: 'rigid',
    },
  })),
});

const template = (...jigsaws: { pool: string; name: string; target: string }[]): Json => ({
  size: [1, 1, 1],
  palette: ['minecraft:stone'],
  blocks: [[0, 0, 0, 0]],
  jigsaws: jigsaws.map((jigsaw) => ({
    pos: [0, 0, 0],
    final_state: 'minecraft:stone',
    ...jigsaw,
  })),
});

/** A town: `demo:start` places `demo:hut`, whose jigsaws reach a project, vanilla and missing pool. */
function town(): Project {
  return {
    formatVersion: 1,
    name: 'Town',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        assets: [],
        elements: [
          element('demo:start', 'minecraft:worldgen/template_pool', pool('demo:hut', 'demo:hut')),
          element(
            'demo:hut',
            'minecraft:structure_template',
            template(
              { pool: 'demo:paths', name: 'demo:door', target: 'demo:path_end' },
              { pool: 'demo:paths', name: 'demo:side', target: 'demo:nothing_named_so' },
              { pool: 'village/plains/streets', name: 'demo:street', target: 'minecraft:street' },
              { pool: 'demo:nowhere', name: 'demo:lost', target: 'demo:any' },
            ),
          ),
          element('demo:paths', 'minecraft:worldgen/template_pool', {
            fallback: 'minecraft:empty',
            elements: [
              {
                weight: 1,
                element: {
                  element_type: 'minecraft:list_pool_element',
                  elements: [
                    { element_type: 'minecraft:single_pool_element', location: 'demo:path' },
                  ],
                  projection: 'rigid',
                },
              },
            ],
          }),
          element(
            'demo:path',
            'minecraft:structure_template',
            template({ pool: 'demo:start', name: 'demo:path_end', target: 'demo:door' }),
          ),
          element('demo:castle', 'minecraft:worldgen/structure', { start_pool: 'demo:start' }),
          element('demo:other', 'minecraft:worldgen/structure', { start_pool: 'demo:paths' }),
          // A vanilla piece is not a project template, so it has no connections.
          element('demo:mixed', 'minecraft:worldgen/template_pool', pool('minecraft:village/x')),
        ],
      },
    ],
  };
}

describe('connections helpers', () => {
  it('normalises ids and reads locations and jigsaws', () => {
    expect(normaliseId('empty')).toBe('minecraft:empty');
    expect(normaliseId(' demo:a ')).toBe('demo:a');
    expect(poolLocations(pool('a', 'demo:b', 'minecraft:a'))).toEqual(['minecraft:a', 'demo:b']);
    expect(poolLocations({ elements: 3 })).toEqual([]);
    expect(templateJigsaws({ jigsaws: [{ pool: 'x' }, { name: 'y' }] })).toEqual([
      { pool: 'x', name: '', target: '' },
    ]);
  });
});

describe('poolConnections', () => {
  it('reports project, vanilla and missing pools and whether the target is found', () => {
    const result = poolConnections(town(), 'demo:start', {
      vanillaPools: ['empty', 'village/plains/streets'],
    });
    expect(result.pieces).toEqual([
      {
        templateId: 'demo:hut',
        jigsaws: [
          {
            pool: 'demo:paths',
            name: 'demo:door',
            target: 'demo:path_end',
            status: 'project',
            targetFound: true,
          },
          {
            pool: 'demo:paths',
            name: 'demo:side',
            target: 'demo:nothing_named_so',
            status: 'project',
            targetFound: false,
          },
          {
            pool: 'village/plains/streets',
            name: 'demo:street',
            target: 'minecraft:street',
            status: 'vanilla',
            targetFound: null,
          },
          {
            pool: 'demo:nowhere',
            name: 'demo:lost',
            target: 'demo:any',
            status: 'missing',
            targetFound: null,
          },
        ],
      },
    ]);
    expect(result.usedBy).toEqual({ structures: ['demo:castle'], pools: ['demo:paths'] });
  });

  it('treats vanilla pools as missing without the vanilla list', () => {
    const result = poolConnections(town(), 'demo:start');
    expect(result.pieces[0]?.jigsaws.map((jigsaw) => jigsaw.status)).toEqual([
      'project',
      'project',
      'missing',
      'missing',
    ]);
  });

  it('follows list pool elements and lists users of another pool', () => {
    const result = poolConnections(town(), 'demo:paths');
    expect(result.pieces).toEqual([
      {
        templateId: 'demo:path',
        jigsaws: [
          {
            pool: 'demo:start',
            name: 'demo:path_end',
            target: 'demo:door',
            status: 'project',
            targetFound: true,
          },
        ],
      },
    ]);
    expect(result.usedBy).toEqual({ structures: ['demo:other'], pools: ['demo:start'] });
  });

  it('is empty for a pool without project templates or an unknown pool', () => {
    expect(poolConnections(town(), 'demo:mixed')).toEqual({
      pieces: [],
      usedBy: { structures: [], pools: [] },
    });
    expect(poolConnections(town(), 'demo:none').pieces).toEqual([]);
  });
});
