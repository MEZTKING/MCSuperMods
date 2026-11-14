/**
 * "Copy as my own script" (ADR 0082 D7 (d)) through the session: one undo step that adds a
 * normal `msm:script` with the book's generated code, gives the book's things its events as
 * hand-made ones and turns the book's rules off, so no rule event is generated any more; Undo
 * leaves the saved project byte-identical. The behaviour of the lowered mod is checked in
 * `@msm/plugin-rules`' `copy.test.ts`.
 */
import {
  createMemoryFileSystem,
  type Element,
  type Json,
  type MemoryFileSystem,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import { describe, expect, it } from 'vitest';
import { planCopyAsScript, SCRIPT_KIND } from '../src/renderer/src/studios/rules/copy-as-script';
import { newSession } from './session-fixture';

async function readAll(fs: MemoryFileSystem): Promise<Map<string, string>> {
  const decoder = new TextDecoder();
  const out = new Map<string, string>();
  for (const path of fs.list().sort()) out.set(path, decoder.decode(await fs.readFile(path)));
  return out;
}

const BOOK: Json = {
  counters: [{ name: 'uses', scope: 'player', start: 0 }],
  format: 1,
  rules: [
    {
      do: [{ count: 1, item: 'demo:ruby', step: 'give_item' }],
      key: 'ruby_gift',
      when: { subject: 'demo:ruby_block', trigger: 'block_used' },
    },
    {
      do: [{ amount: 1, counter: 'uses', scope: 'player', step: 'add_to_counter' }],
      key: 'count_uses',
      only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
      when: { subject: 'demo:ruby_block', trigger: 'block_broken' },
    },
  ],
};

describe('Copy as my own script through the session', () => {
  it('is one undo step: a script, hand-made events, the rules off; Undo is byte-identical', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs, {}, { validationDelay: 0 });
    await session.newProject();
    session.addElement({
      id: 'demo:ruby_block' as ResourceLocation,
      kind: 'msm:block',
      data: { display_name: 'Ruby Block', format: 1, model: 'minecraft:block/stone' },
    });
    session.addElement({
      id: 'demo:ruby' as ResourceLocation,
      kind: 'msm:item',
      data: { display_name: 'Ruby', format: 1 },
    });
    session.addElement({ id: 'demo:rules' as ResourceLocation, kind: 'msm:rules', data: BOOK });
    await session.save();
    const before = await readAll(fs);
    const viewBefore = await session.rulesViewNow();
    expect(viewBefore.ruleEventsFor('demo:ruby_block')).toHaveLength(2);

    const plan = planCopyAsScript(
      session.snapshot.project as Project,
      'demo:rules',
      session.target,
    );
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.scriptId).toBe('demo:rules_script');
    expect(plan.items.map((item) => [item.op, item.elementId, item.kind])).toEqual([
      ['create', 'demo:rules_script', SCRIPT_KIND],
      ['update', 'demo:ruby_block', 'msm:block'],
      ['update', 'demo:rules', 'msm:rules'],
    ]);
    const result = await session.applyChangeset(plan.items, plan.label);
    expect(result.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe('Copy demo:rules as my own script');

    const view = await session.rulesViewNow();
    expect(view.ruleEventsFor('demo:ruby_block')).toEqual([]);
    const elements = (session.snapshot.project as Project).namespaces.flatMap(
      (namespace) => namespace.elements,
    );
    const block = elements.find((entry) => entry.id === 'demo:ruby_block') as Element;
    expect(Object.keys((block.data as { events: object }).events).sort()).toEqual([
      'demo:ruby_block_script_block_broken',
      'demo:ruby_block_script_block_used',
    ]);
    const script = elements.find((entry) => entry.id === 'demo:rules_script') as Element;
    expect((script.data as { lines: string[] }).lines.join('\n')).toContain(
      'msm.actions.define("demo:rules/rules/ruby_block/block_broken"',
    );
    const errors = session.snapshot.problems.filter(
      (problem) =>
        problem.severity === 'error' &&
        (problem.code.startsWith('rules.') || problem.code.startsWith('schema.')),
    );
    expect(errors).toEqual([]);
    await session.save();
    expect(fs.list()).toContain('content/demo/script/rules_script.json');

    expect(session.undo()).toBe(true);
    await session.save();
    expect(await readAll(fs)).toEqual(before);
  });

  it('is not offered when the book has nothing turned on', () => {
    const project = {
      formatVersion: 1,
      name: 'Demo',
      targets: [],
      plugins: [],
      settings: {},
      namespaces: [
        {
          name: 'demo',
          assets: [],
          elements: [
            {
              formatVersion: 1,
              id: 'demo:rules',
              kind: 'msm:rules',
              data: { counters: [], format: 1, rules: [] },
              meta: { createdAt: '2026-01-01T00:00:00.000Z' },
            },
          ],
        },
      ],
    } as unknown as Project;
    const target = { fabric: {}, mcVersion: '26.3' } as never;
    expect(planCopyAsScript(project, 'demo:rules', target).ok).toBe(false);
  });
});
