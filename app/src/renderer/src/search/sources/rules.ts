/**
 * The Rules source (ADR 0124 D3; B660; B655's note): one entry per trigger ("When"), step ("Do"),
 * condition ("Only if") and number reading of the Rules catalogue, titled with its catalogue label
 * so the Rules plugin's idea words reach it through the label, with its sentence (slots read as
 * their names); available when the rule book kind is registered, technical for Very easy when the
 * catalogue keeps it out of Very easy. Also the rules of the open mod's rule books, one entry each
 * with the rule's sentence as the Rule book Studio reads it.
 *
 * @packageDocumentation
 */

import type { Element, Json, JsonObject, Project } from '@msm/core';
import {
  type CatalogueEntry,
  CONDITIONS,
  RULES_KIND,
  ruleSentence,
  STEPS,
  TRIGGERS,
  VALUES,
} from '@msm/plugin-rules';
import type { SearchEntry } from '@msm/search';
import {
  asAction,
  asPreview,
  entryIds,
  type RulePart,
  registeredKinds,
  type StaticSourceInput,
  sentenceField,
  wordsField,
} from './shared';

/** What each part is called in the Rule book's own words. */
const PART_WORDS: Readonly<Record<RulePart, readonly string[]>> = {
  trigger: ['when', 'rule'],
  step: ['do', 'rule step'],
  condition: ['only if', 'rule condition'],
  value: ['number', 'rule'],
};

/** A catalogue sentence with its slots read as their names (`{block}` reads `block`). */
export function catalogueSentence(sentence: string): string {
  return sentence
    .replace(/\{([a-z_]+)\}/g, (_match, name: string) => name.replace(/_/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function partEntries(
  part: RulePart,
  entries: readonly CatalogueEntry[],
  available: boolean,
  group: (entry: CatalogueEntry) => string | undefined,
): SearchEntry[] {
  return entries.map((entry) => {
    const action = { type: 'rule-part', part, id: entry.id } as const;
    return {
      id: entryIds.rulePart(part, entry.id),
      source: 'rule',
      title: entry.label,
      ...sentenceField(catalogueSentence(entry.sentence)),
      ...wordsField([...PART_WORDS[part], group(entry)]),
      ids: [entry.id],
      ...(available
        ? { available: true }
        : { available: false, unavailableReason: 'Needs the Rules plugin.' }),
      ...(entry.veryEasy ? {} : { technical: true }),
      plugin: 'rules',
      action: asAction(action),
      preview: asPreview(action),
    };
  });
}

const groupOf = (entry: CatalogueEntry): string | undefined => {
  const group = (entry as CatalogueEntry & { group?: unknown }).group;
  return typeof group === 'string' ? group.replace(/_/g, ' ') : undefined;
};

/** The Rules catalogue's entries: triggers, steps, conditions and number readings. */
export function ruleCatalogueEntries(input: Pick<StaticSourceInput, 'plugins'>): SearchEntry[] {
  const available = registeredKinds(input).has(RULES_KIND);
  return [
    ...partEntries('trigger', TRIGGERS, available, groupOf),
    ...partEntries('step', STEPS, available, groupOf),
    ...partEntries('condition', CONDITIONS, available, groupOf),
    ...partEntries('value', VALUES, available, () => undefined),
  ];
}

const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** The rules of the project's rule books, one entry each (`project:rule:<book>#<index>`). */
export function projectRuleEntries(
  project: Project,
  names: (id: string) => string | undefined,
  bookName: (book: Element) => string,
): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== RULES_KIND) continue;
      const rules = asObject(element.data)?.rules;
      if (!Array.isArray(rules)) continue;
      rules.forEach((value, index) => {
        const rule = asObject(value);
        if (rule === undefined) return;
        let sentence = '';
        try {
          sentence = ruleSentence(rule, names);
        } catch {
          sentence = '';
        }
        const name =
          typeof rule.name === 'string' && rule.name.trim() !== '' ? rule.name.trim() : '';
        const when = asObject(rule.when)?.trigger;
        const action = { type: 'rule', book: element.id, index } as const;
        out.push({
          id: entryIds.rule(element.id, index),
          source: 'project',
          title: name !== '' ? name : sentence !== '' ? sentence : `Rule ${index + 1}`,
          ...sentenceField(name !== '' ? sentence : bookName(element)),
          ...wordsField(['rule', bookName(element)]),
          ids: typeof when === 'string' ? [element.id, when] : [element.id],
          available: true,
          action: asAction(action),
          preview: asPreview(action),
        });
      });
    }
  }
  return out;
}
