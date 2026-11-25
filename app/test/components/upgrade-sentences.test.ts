/**
 * The report's words (ADR 0136 D15, B818): every change of every built-in target's change set
 * reads in plain words (no id, no forbidden word), uses its curated sentence when it has one,
 * and a template names no version of its own: the version comes from the caller.
 */
import type { TargetChange } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { forbiddenIn } from '../../src/renderer/src/components/ai/ai-words';
import {
  changeSentence,
  detailSentence,
  plainText,
  subjectWords,
  todoItemHint,
} from '../../src/renderer/src/components/upgrade/sentences';

const changes: TargetChange[] = builtInTargets.flatMap(
  (entry) => entry.target.changes?.changes ?? [],
);

describe('The upgrade report in plain words', () => {
  it('words every change of every change set without ids', () => {
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      const sentence = changeSentence(change, '9.9');
      expect(forbiddenIn(sentence), `${change.id}: ${sentence}`).toEqual([]);
      expect(sentence.endsWith('.'), sentence).toBe(true);
    }
  });

  it('uses the curated sentence when there is one, and the template names only the given version', () => {
    const curated = changes.find((change) => change.sentence !== undefined);
    if (curated?.sentence === undefined) throw new Error('No curated sentence.');
    expect(changeSentence(curated, '9.9')).toBe(plainText(curated.sentence));
    for (const change of changes.filter((entry) => entry.sentence === undefined)) {
      const sentence = changeSentence(change, '9.9');
      // The only version in a template's words is the one it was given.
      for (const match of sentence.matchAll(/Minecraft (\d+(?:\.\d+)*)/g)) {
        expect(match[1], sentence).toBe('9.9');
      }
    }
  });

  it('turns ids and field names into words', () => {
    expect(plainText('use #minecraft:immune_to_freezing, its new name')).toBe(
      'use immune to freezing, its new name',
    );
    expect(plainText('use minecraft:gui/sprites/friends/tab')).toBe('use tab');
    expect(plainText('at 1:30')).toBe('at 1:30');
    expect(
      subjectWords({
        id: 'x',
        area: 'formats',
        what: 'field-removed',
        registry: 'minecraft:resource',
        subject: 'minecraft:resource/worldgen/noise_settings',
        field: '/default_block',
        handling: 'auto',
        source: 'mcdoc',
      }),
    ).toBe('noise settings');
    expect(
      detailSentence(
        {
          op: 'rename-id',
          path: '/type',
          before: 'minecraft:a_b',
          after: 'minecraft:c',
          changeId: 'x',
        },
        '9.9',
      ),
    ).toBe('A b becomes c, its name in Minecraft 9.9.');
    expect(
      todoItemHint({
        id: 'x',
        source: 'migration',
        problem: { severity: 'error', code: 'x', message: '' },
        check: 'manual',
        hint: 'use minecraft:water',
      }),
    ).toBe('How: Use water.');
  });
});
