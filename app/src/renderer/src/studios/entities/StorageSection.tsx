/**
 * The Mob Studio's "Storage" section (ADR 0098 D3, ADR 0101 D1): `msm:storage` on or off, the
 * number of rows, whether a chest must be put on the mob first, and the open and close sounds.
 *
 * @packageDocumentation
 */

import { DEFAULT_STORAGE_ROWS, STORAGE_COMPONENT } from '@msm/plugin-entities';
import { IdField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { ChoiceField, componentTools, DefaultCheck, FieldProblems } from './MobKindSection';
import type { MobSectionProps } from './mob-kinds';

const FIELDS = ['rows', 'needs_chest', 'open_sound', 'close_sound'] as const;

/** The row choices, 1 to 6, as strings for the picker. */
export const STORAGE_ROW_CHOICES: readonly string[] = ['1', '2', '3', '4', '5', '6'];

/** "3 rows (27 slots)". */
export function storageRowWords(rows: number): string {
  return `${rows} ${rows === 1 ? 'row' : 'rows'} (${rows * 9} slots)`;
}

const ROW_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  STORAGE_ROW_CHOICES.map((rows) => [rows, storageRowWords(Number(rows))]),
);

/** The "Storage" section. */
export function StorageSection(props: MobSectionProps) {
  const tools = componentTools(props, STORAGE_COMPONENT);
  const { value } = tools;
  const rows = typeof value.rows === 'number' ? value.rows : DEFAULT_STORAGE_ROWS;
  const tameable =
    (props.data as { components?: Record<string, unknown> } | null)?.components?.[
      'msm:tameable'
    ] !== undefined;
  const sound = (key: 'open_sound' | 'close_sound', label: string) => (
    <IdField
      label={label}
      value={typeof value[key] === 'string' ? String(value[key]) : ''}
      registry="sound_event"
      suggest={props.suggest}
      testId={`entity-storage-${key.replace('_sound', '')}-sound`}
      onCommit={(text) => tools.setField(key, text === '' ? undefined : text)}
    />
  );
  return (
    <Section title="Storage" testId="entity-storage">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-storage-on"
          checked={tools.on}
          onChange={(event) => tools.toggle(event.target.checked, () => ({}))}
        />
        Carries things, like a donkey with a chest
      </label>
      {tools.on ? (
        <>
          <ChoiceField
            label="Size"
            value={String(rows)}
            choices={STORAGE_ROW_CHOICES}
            labels={ROW_LABELS}
            testId="entity-storage-rows"
            onChange={(next) =>
              tools.setField(
                'rows',
                next === undefined || Number(next) === DEFAULT_STORAGE_ROWS
                  ? undefined
                  : Number(next),
              )
            }
          />
          <DefaultCheck
            label="Needs a chest put on it first"
            value={value.needs_chest}
            fallback={false}
            testId="entity-storage-needs-chest"
            onChange={(next) => tools.setField('needs_chest', next)}
          />
          <div className="flex flex-wrap items-end gap-2">
            {sound('open_sound', 'Opening sound')}
            {sound('close_sound', 'Closing sound')}
          </div>
          <p className="text-muted text-xs" data-testid="entity-storage-how">
            Its rider opens it with the inventory key; {tameable ? 'its owner' : 'anyone'} opens it
            by using the mob while sneaking. What is inside is saved, and dropped when the mob dies.
            Empty sounds use a chest's.
          </p>
        </>
      ) : (
        <p className="text-muted text-xs">The mob carries nothing.</p>
      )}
      <FieldProblems problems={props.problems} component={STORAGE_COMPONENT} keys={FIELDS} />
    </Section>
  );
}
