import type { Reference } from '@msm/core';
import { createRegistryIndex } from '@msm/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_COMMAND_IDS,
  definitionOf,
  paletteCommands,
  referenceAt,
} from '../../src/renderer/src/commands/built-in-commands';
import { problemLocation } from '../../src/renderer/src/components/ProblemsPanel';
import { parseNewId } from '../../src/renderer/src/components/RenameElementDialog';
import { usageLocation } from '../../src/renderer/src/components/UsagesDialog';
import { createCompletionSource, stripIdPath } from '../../src/renderer/src/studios/completions';
import { element, sampleProject } from './fixtures';

describe('paletteCommands', () => {
  it('lists available built-in commands in order, then plugin commands', () => {
    const save = vi.fn();
    const commands = paletteCommands(
      {
        save,
        undo: null,
        renameElement: vi.fn(),
        settings: vi.fn(),
        chooseInstallTarget: vi.fn(),
        checkForUpdates: vi.fn(),
      },
      [{ id: 'msm.demo.hello', title: 'Say hello', run: vi.fn() }],
      { modKey: 'Ctrl', onError: vi.fn() },
    );
    expect(commands.map((command) => command.id)).toEqual([
      'save',
      'renameElement',
      'settings',
      'chooseInstallTarget',
      'checkForUpdates',
      'msm.demo.hello',
    ]);
    expect(commands[0]?.shortcut).toBe('Ctrl+S');
    expect(commands[1]?.shortcut).toBe('F2');
    commands[0]?.run();
    expect(save).toHaveBeenCalledOnce();
    expect(new Set(BUILT_IN_COMMAND_IDS).size).toBe(BUILT_IN_COMMAND_IDS.length);
    expect(commands.find((command) => command.id === 'chooseInstallTarget')?.title).toBe(
      'Choose install target…',
    );
  });

  it('offers the AI helper commands with their titles and shortcut', () => {
    const commands = paletteCommands(
      { aiHelper: vi.fn(), aiExplainProblem: vi.fn(), aiAskElement: vi.fn() },
      [],
      { modKey: 'Ctrl', onError: vi.fn() },
    );
    expect(commands.map((command) => [command.id, command.title, command.shortcut])).toEqual([
      ['aiHelper', 'Open AI helper', 'Ctrl+Shift+A'],
      ['aiExplainProblem', 'Explain this problem with the AI helper', undefined],
      ['aiAskElement', 'Ask the AI helper about this element', undefined],
    ]);
    expect(
      paletteCommands({ aiHelper: vi.fn(), aiExplainProblem: null }, [], {
        modKey: 'Cmd',
        onError: vi.fn(),
      }).map((command) => command.id),
    ).toEqual(['aiHelper']);
  });

  it('offers "Export Java project…" after the Fabric mod jar', () => {
    const commands = paletteCommands(
      { exportFabricJar: vi.fn(), exportJavaProject: vi.fn(), testInMinecraft: vi.fn() },
      [],
      { modKey: 'Ctrl', onError: vi.fn() },
    );
    expect(commands.map((command) => [command.id, command.title])).toEqual([
      ['exportFabricJar', 'Export Fabric mod jar…'],
      ['exportJavaProject', 'Export Java project…'],
      ['testInMinecraft', 'Test in Minecraft…'],
    ]);
  });

  it('reports plugin command failures', async () => {
    const onError = vi.fn();
    const [thrown, rejected] = paletteCommands(
      {},
      [
        {
          id: 'a',
          title: 'Throws',
          run: () => {
            throw new Error('boom');
          },
        },
        { id: 'b', title: 'Rejects', run: () => Promise.reject(new Error('later')) },
      ],
      { modKey: 'Cmd', onError },
    );
    thrown?.run();
    rejected?.run();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError.mock.calls.map((call) => call[0])).toEqual(['Throws', 'Rejects']);
  });
});

describe('go to definition', () => {
  const refs: Reference[] = [
    { from: 'demo:main', path: '/result/id', registry: 'item', to: 'minecraft:stone' },
    {
      from: 'demo:main',
      path: '/lines/0',
      registry: '',
      to: 'demo:a',
      range: { start: 9, end: 15 },
    },
    {
      from: 'demo:main',
      path: '/lines/0',
      registry: '',
      to: 'demo:b',
      range: { start: 20, end: 26 },
    },
  ];

  it('finds the reference at a field or the caret on a function line', () => {
    expect(referenceAt(refs, { pointer: '/result/id' })?.to).toBe('minecraft:stone');
    expect(referenceAt(refs, { pointer: '/result' })?.to).toBe('minecraft:stone');
    expect(referenceAt(refs, { pointer: '/lines/0', column: 22 })?.to).toBe('demo:b');
    expect(referenceAt(refs, { pointer: '/lines/0' })?.to).toBe('demo:a');
    expect(referenceAt(refs, { pointer: '/group' })).toBeUndefined();
  });

  it('prefers the element of the reference registry', () => {
    const project = sampleProject();
    project.namespaces[0]?.elements.push(
      element('demo:gems', 'minecraft:recipe'),
      element('demo:gems', 'minecraft:tag/item'),
    );
    const tag: Reference = { from: 'x:y', path: '/a', registry: 'tag/item', to: 'demo:gems' };
    expect(definitionOf(project, tag)?.kind).toBe('minecraft:tag/item');
    expect(definitionOf(project, { ...tag, registry: '' })?.kind).toBe('minecraft:recipe');
    expect(definitionOf(project, { ...tag, to: 'demo:none' })).toBeUndefined();
  });
});

describe('small wiring helpers', () => {
  it('shows function problems and usages as 1-based lines', () => {
    expect(
      problemLocation({
        severity: 'error',
        code: 'x',
        message: 'm',
        path: '/lines/2',
        range: { start: 4, end: 6 },
      }),
    ).toBe('line 3:5');
    expect(problemLocation({ severity: 'error', code: 'x', message: 'm', path: '/a' })).toBe('/a');
    expect(usageLocation({ from: 'a:b', path: '/lines/0', registry: '', to: 'c:d' })).toBe(
      'line 1',
    );
  });

  it('checks a new id for a rename', () => {
    expect(parseNewId(' demo:hello ', 'demo:greet')).toBe('demo:hello');
    expect(() => parseNewId('demo:greet', 'demo:greet')).toThrow(/different/);
    expect(() => parseNewId('Demo:x', 'demo:greet')).toThrow(/not a valid id/);
    expect(() => parseNewId('demo:a//b', 'demo:greet')).toThrow(/not a valid id/);
  });
});

describe('completions', () => {
  const project = sampleProject();
  project.namespaces[0]?.elements.push(element('demo:gems', 'minecraft:tag/item'));
  const registries = createRegistryIndex({
    vanilla: { texture: ['entity/banner/base', 'entity/banner/stripe', 'block/stone'] },
    project: { 'tag/item': ['demo:gems'] },
  });
  const source = createCompletionSource(project, registries);

  it('strips an id path and keeps only ids under it', () => {
    expect([
      ...stripIdPath(['minecraft:entity/banner/base', 'minecraft:block/x'], 'entity/banner/'),
    ]).toEqual(['minecraft:base']);
    expect([...stripIdPath(['#minecraft:x'], 'p/')]).toEqual(['#minecraft:x']);
    expect(source.suggest('texture', 'st', 'entity/banner/')).toEqual(['minecraft:stripe']);
    expect(source.suggest('texture', '', 'entity/banner/')).toEqual([
      'minecraft:base',
      'minecraft:stripe',
    ]);
  });

  it('answers tag registries with or without a leading #', () => {
    expect(source.suggest('tag/item', 'ge')).toEqual(['demo:gems']);
    expect(source.suggest('tag/item', '#ge')).toEqual(['#demo:gems']);
    expect(source.suggest('item', '#demo:')).toEqual(['#demo:gems']);
  });
});
