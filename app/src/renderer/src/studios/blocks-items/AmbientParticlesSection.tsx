/**
 * The Block Studio's "Ambient particles" section (ADR 0081 D2), loaded with `React.lazy` and
 * shown for every block type but `portal`: `msm:ambient_particles` (ADR 0080 D6), the particles
 * a block shows by itself as a torch shows its flame. "Particle" (with the events editor's
 * "Kind": a particle, coloured dust, block or item pieces), "Chance per tick", "Count",
 * "Where" ("Centre", "Top", "Whole block" or custom offset and spread), "Velocity" and "Only
 * when" (block state properties that must match). Every change is one undoable edit; the
 * model is `ambient-particles-model.ts`.
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import { X } from 'lucide-react';
import { useState } from 'react';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass, isWithin, ProblemList } from '../../forms';
import { typingKey } from '../../forms/context';
import { NumberField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import {
  AMBIENT_PATH,
  AMBIENT_WHERE,
  AMBIENT_WHERE_LABELS,
  type AmbientWhere,
  ambientWhere,
  DEFAULT_OFFSET,
  DEFAULT_SPREAD,
  newAmbientParticles,
  type StateRow,
  stateRows,
  statesOf,
  tripleOf,
  tripleWith,
  withAmbientWhere,
} from './ambient-particles-model';
import { asObject, pointerOf } from './blocks-items-model';
import { LabelledChoice, ParticleSpecField } from './EventsEditor';
import { particlesFirst } from './particle-model';
import { CheckField } from './parts';

type Setter = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** Props of {@link AmbientParticlesSection}. */
export interface AmbientParticlesSectionProps {
  element: Element;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** The project's own particle ids (a new component starts with the first). */
  particles: readonly string[];
  /** Sets one path as one edit (`coalesce` merges typing). */
  set: Setter;
}

const AXES = ['X', 'Y', 'Z'] as const;

/** Three numbers of a `[x, y, z]` field, each one edit. */
function TripleFields(props: {
  label: string;
  value: Json | undefined;
  fallback: readonly [number, number, number];
  testId: string;
  pointer: string;
  onChange(value: Json | undefined, coalesce: string): void;
}) {
  const current = tripleOf(props.value, props.fallback);
  return (
    <div className="flex flex-wrap items-end gap-2">
      {AXES.map((axis, at) => (
        <NumberField
          key={axis}
          label={`${props.label} ${axis}`}
          value={current[at]}
          testId={`${props.testId}-${axis.toLowerCase()}`}
          onCommit={(next) => {
            if (next === undefined) return;
            props.onChange(
              tripleWith(props.value, at, next, props.fallback),
              typingKey(props.pointer),
            );
          }}
        />
      ))}
    </div>
  );
}

export default function AmbientParticlesSection(props: AmbientParticlesSectionProps) {
  const { element, problems, set } = props;
  const component = asObject(element.data).components;
  const value = asObject(component)['msm:ambient_particles'];
  const present = value !== undefined;
  const ambient = asObject(value);
  const pointer = pointerOf(AMBIENT_PATH);
  const setIn = (key: string, next: Json | undefined, coalesce?: string) =>
    set([...AMBIENT_PATH, key], next, coalesce);
  // "Custom" stays chosen while its numbers still match a preset.
  const [custom, setCustom] = useState(false);
  const where: AmbientWhere = custom ? 'custom' : ambientWhere(value);
  const rows = stateRows(value);
  const [draft, setDraft] = useState<StateRow>({ property: '', value: '' });
  const setRows = (next: readonly StateRow[]) => setIn('states', statesOf(next));

  return (
    <Section title="Ambient particles" testId="block-ambient">
      <p className="text-muted text-xs">
        Particles the block shows by itself, as a torch shows its flame. The game draws them near
        the player only; they are not sent by the server.
      </p>
      <CheckField
        label="Show particles around the block"
        checked={present}
        testId="block-ambient-toggle"
        onChange={(checked) =>
          set(AMBIENT_PATH, checked ? newAmbientParticles(props.particles) : undefined)
        }
      />
      {present && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <ParticleSpecField
              label="Particle"
              value={ambient.particle}
              suggest={particlesFirst(props.suggest)}
              pointer={`${pointer}/particle`}
              testId="block-ambient-particle"
              onChange={(next, coalesce) => setIn('particle', next, coalesce)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <NumberField
              label="Chance per tick"
              value={ambient.chance}
              allowEmpty
              testId="block-ambient-chance"
              onCommit={(next) => setIn('chance', next, typingKey(`${pointer}/chance`))}
            />
            <NumberField
              label="Count"
              value={ambient.count}
              integer
              allowEmpty
              testId="block-ambient-count"
              onCommit={(next) => setIn('count', next, typingKey(`${pointer}/count`))}
            />
            <LabelledChoice
              label="Where"
              value={where}
              labels={AMBIENT_WHERE_LABELS}
              order={AMBIENT_WHERE}
              testId="block-ambient-where"
              onChange={(next) => {
                setCustom(next === 'custom');
                set(AMBIENT_PATH, withAmbientWhere(value, next as AmbientWhere));
              }}
            />
          </div>
          <p className="text-muted text-xs">
            Empty chance: every tick. Empty count: 1 (at most 16).
          </p>
          {where === 'custom' && (
            <>
              <TripleFields
                label="Offset"
                value={ambient.offset}
                fallback={DEFAULT_OFFSET}
                testId="block-ambient-offset"
                pointer={`${pointer}/offset`}
                onChange={(next, coalesce) => setIn('offset', next, coalesce)}
              />
              <TripleFields
                label="Spread"
                value={ambient.spread}
                fallback={DEFAULT_SPREAD}
                testId="block-ambient-spread"
                pointer={`${pointer}/spread`}
                onChange={(next, coalesce) => setIn('spread', next, coalesce)}
              />
              <p className="text-muted text-xs">
                Offset is in blocks from the block's corner (0.5 is the middle); spread is how far
                they scatter around it.
              </p>
            </>
          )}
          <TripleFields
            label="Velocity"
            value={ambient.velocity}
            fallback={[0, 0, 0]}
            testId="block-ambient-velocity"
            pointer={`${pointer}/velocity`}
            onChange={(next, coalesce) => setIn('velocity', next, coalesce)}
          />
          <div className="flex flex-col gap-1" data-testid="block-ambient-states">
            <span className="text-xs">Only when</span>
            {rows.length === 0 && (
              <p className="text-muted text-xs">In every state of the block.</p>
            )}
            {rows.map((row, index) => (
              <div key={row.property} className="flex items-center gap-1 text-xs">
                <code className="font-mono" data-testid={`block-ambient-state-${index}`}>
                  {row.property} = {row.value}
                </code>
                <button
                  type="button"
                  className={iconButtonClass}
                  aria-label={`Remove the condition ${row.property}`}
                  data-testid={`block-ambient-state-${index}-remove`}
                  onClick={() => setRows(rows.filter((_, at) => at !== index))}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-1">
              <input
                type="text"
                aria-label="Only when property"
                placeholder="lit"
                className={`${inputClass} w-32 font-mono`}
                data-testid="block-ambient-state-property"
                value={draft.property}
                onChange={(event) => setDraft({ ...draft, property: event.target.value })}
              />
              <input
                type="text"
                aria-label="Only when value"
                placeholder="true"
                className={`${inputClass} w-32 font-mono`}
                data-testid="block-ambient-state-value"
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              />
              <button
                type="button"
                className={buttonClass}
                data-testid="block-ambient-state-add"
                disabled={draft.property.trim() === ''}
                onClick={() => {
                  const rest = rows.filter((row) => row.property !== draft.property.trim());
                  setRows([...rest, draft]);
                  setDraft({ property: '', value: '' });
                }}
              >
                Add condition
              </button>
            </div>
          </div>
        </>
      )}
      <ProblemList problems={problems.filter((problem) => isWithin(problem.path, pointer))} />
    </Section>
  );
}
