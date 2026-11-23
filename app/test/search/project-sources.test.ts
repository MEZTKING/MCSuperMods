/**
 * The project, Things to fix and guide sources (B660): elements by their display names, a Creator
 * set folding with its main element, pictures and sounds, each rule of a rule book in the Rule
 * book's words, problems in plain words once each, the ids the mod uses, the things the answer
 * reader may name, and the guide's headings.
 */

import type { Problem } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { guideEntries } from '../../src/renderer/src/search/sources/guide';
import {
  inModIds,
  projectEntries,
  projectThings,
} from '../../src/renderer/src/search/sources/project';
import { projectWith } from './fixtures';

const project = (() => {
  const base = projectWith([
    {
      id: 'gems:ruby_sword',
      kind: 'msm:item',
      data: { display_name: 'Ruby Sword' },
      setId: 's1',
      flowId: 'weapon',
    },
    { id: 'gems:ruby_sword_model', kind: 'minecraft:model', setId: 's1', flowId: 'weapon' },
    { id: 'gems:ruby_block', kind: 'msm:block', data: { display_name: 'Block of Ruby' } },
    {
      id: 'gems:ruby_block_rules',
      kind: 'msm:rules',
      data: {
        format: 1,
        counters: [],
        rules: [
          {
            key: 'drops_xp',
            when: { trigger: 'block_broken', subject: 'gems:ruby_block' },
            do: [{ step: 'give_experience', amount: 5 }],
          },
          {
            key: 'named',
            name: 'Ring the bell',
            when: { trigger: 'block_used', subject: 'gems:ruby_block' },
            do: [],
          },
        ],
      },
    },
  ]);
  (base.namespaces[0] as (typeof base.namespaces)[number]).assets.push(
    { path: 'textures/block/ruby_block.png', mediaType: 'image/png' },
    { path: 'sounds/ruby_chime.ogg', mediaType: 'audio/ogg' },
    { path: 'models/block/ruby_block.json', mediaType: 'application/json' },
  );
  return base;
})();

const problems: Problem[] = [
  {
    severity: 'error',
    code: 'rules.unknown-step',
    message: 'Unknown step',
    elementId: 'gems:ruby_block_rules',
    path: '/rules/0/do/0',
  },
  {
    severity: 'error',
    code: 'rules.unknown-step',
    message: 'Unknown step',
    elementId: 'gems:ruby_block_rules',
    path: '/rules/0/do/0',
  },
  {
    severity: 'warning',
    code: 'made.up-code',
    message: 'Something odd',
    elementId: 'gems:ruby_block',
  },
  { severity: 'info', code: 'made.up-info', message: 'Just so you know' },
];

describe('the project source', () => {
  const entries = projectEntries({
    project,
    problems,
    flowTitles: { weapon: 'Weapon' },
    kinds: {
      label: (kind) => (kind === 'msm:item' ? 'Items' : undefined),
      technical: (kind) => kind === 'minecraft:model',
    },
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  it('names elements by their display names and marks technical kinds', () => {
    expect(byId.get('project:element:gems:ruby_sword')?.title).toBe('Ruby Sword');
    expect(byId.get('project:element:gems:ruby_sword')?.sentence).toBe('Items');
    expect(byId.get('project:element:gems:ruby_sword_model')?.technical).toBe(true);
    expect(byId.get('project:element:gems:ruby_block')?.ids).toEqual([
      'gems:ruby_block',
      'msm:block',
    ]);
  });

  it('gives a Creator set its main element’s action, so the two fold', () => {
    const set = byId.get('project:set:s1');
    expect(set?.title).toBe('Ruby Sword');
    expect(set?.sentence).toBe('Weapon');
    expect(set?.action).toEqual(byId.get('project:element:gems:ruby_sword')?.action);
  });

  it('lists pictures and sounds, not other files', () => {
    expect(byId.get('project:asset:gems:textures/block/ruby_block.png')?.words).toContain(
      'picture',
    );
    expect(byId.get('project:asset:gems:sounds/ruby_chime.ogg')?.words).toContain('sound');
    expect(byId.has('project:asset:gems:models/block/ruby_block.json')).toBe(false);
  });

  it('reads each rule in the Rule book’s words', () => {
    const first = byId.get('project:rule:gems:ruby_block_rules#0');
    expect(first?.title).toMatch(/Block of Ruby/);
    expect(first?.action).toEqual({ type: 'rule', book: 'gems:ruby_block_rules', index: 0 });
    expect(byId.get('project:rule:gems:ruby_block_rules#1')?.title).toBe('Ring the bell');
  });

  it('lists errors and warnings once each, in plain words', () => {
    const fixes = entries.filter((entry) => entry.source === 'problem');
    expect(fixes).toHaveLength(2);
    expect(fixes[0]?.title).not.toBe('Unknown step');
    expect(fixes[0]?.action).toMatchObject({
      type: 'problem',
      code: 'rules.unknown-step',
      path: '/rules/0/do/0',
    });
    expect(fixes[1]?.title).toBe('Something in Block of Ruby needs fixing.');
  });

  it('gives the reader the mod’s things and the engine the ids the mod uses', () => {
    expect(projectThings(project)).toEqual([
      { id: 'gems:ruby_sword', name: 'Ruby Sword', sort: 'item' },
      { id: 'gems:ruby_block', name: 'Block of Ruby', sort: 'block' },
    ]);
    expect(inModIds(project)).toEqual([
      'flow:weapon',
      'kind:minecraft:model',
      'kind:msm:block',
      'kind:msm:item',
      'kind:msm:rules',
    ]);
    expect(projectEntries({ project: null, problems })).toEqual([]);
  });
});

describe('the guide source', () => {
  it('makes one entry per heading, page titles as words below the title', () => {
    const entries = guideEntries({
      pages: [{ page: 'vehicles', title: 'Vehicles' }],
      sections: [
        { page: 'vehicles', level: 1, heading: 'Vehicles', anchor: 'vehicles', sentence: '' },
        {
          page: 'vehicles',
          level: 2,
          heading: 'Make a car',
          anchor: 'make-a-car',
          sentence: 'Pick the Car flow.',
        },
        {
          page: 'vehicles',
          level: 2,
          heading: 'Make a car',
          anchor: 'make-a-car',
          sentence: 'Repeated.',
        },
      ],
    });
    expect(entries.map((entry) => entry.id)).toEqual([
      'guide:vehicles#vehicles',
      'guide:vehicles#make-a-car',
    ]);
    expect(entries[0]?.sentence).toBeUndefined();
    expect(entries[1]?.words).toContain('Vehicles');
    expect(entries[1]?.action).toEqual({ type: 'guide', page: 'vehicles', anchor: 'make-a-car' });
    expect(guideEntries(null)).toEqual([]);
  });

  it('gives a page its subject as words, so the page about a thing comes before a section of another page', () => {
    // "how do I make a fluid" found the Templates page's list "Fluids" one point above the
    // Fluids page (B666's misses); the follow-ups after the close give a page its subject.
    const entries = guideEntries({
      pages: [{ page: 'rules', title: 'Rules: make things happen without code' }],
      sections: [
        {
          page: 'rules',
          level: 1,
          heading: 'Rules: make things happen without code',
          anchor: 'rules-make-things-happen-without-code',
          sentence: '',
        },
        { page: 'rules', level: 2, heading: 'Where rules live', anchor: 'where', sentence: '' },
      ],
    });
    expect(entries[0]?.words).toEqual(['guide', 'how to', 'Rules']);
    expect(entries[1]?.words).toEqual([
      'guide',
      'how to',
      'Rules: make things happen without code',
    ]);
  });
});
