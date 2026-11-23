/**
 * One Block Studio (ADR 0117 D1, ADR 0113 D3; B555) for `msm:one_block`, loaded lazily: "The
 * magic block" (where it is, in which world, whether it starts over after the last phase and
 * whether each phase's name is said in chat) and its "Phases", each with its name, "Breaks in
 * this phase", the blocks it turns into by weight, "Chests now and then" (a chance and the
 * chest's loot) and "Mobs now and then" (a chance and the mobs by weight).
 *
 * Live view (ADR 0119 D1): "What the block turns into", each phase's odds from its weights and
 * chances, and the next breaks played from a seed as the lowering plays them (B552: phases by
 * their breaks, chances out of 10,000), following every edit (about right: the run is an
 * example, the game's random numbers differ; the odds are the data's own). Try it refills the
 * block by phase (B558).
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { typingKey } from '../../forms/context';
import { LiveViewFrame } from '../../liveviews/frame/LiveViewFrame';
import { SeedBox } from '../../liveviews/frame/SeedBox';
import { asObject, moved, pathSetter } from '../blocks-items/blocks-items-model';
import { CheckField, TextField } from '../blocks-items/parts';
import { NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import {
  DIMENSION_KIND,
  DIMENSION_LABELS,
  LOOT_TABLE_KIND,
  listOf,
  objectOf,
  oddsOf,
  percentOf,
  runOneBlock,
  textOf,
} from './games-model';
import { NamedIdField, PercentField, PosField, ThingField } from './pickers';
import { GamesStudioShell } from './shell';

/** How many breaks the live view plays. */
export const LIVE_BREAKS = 24;

type SetPath = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** The live view; see the module comment. */
function OneBlockLook(props: { project: Project; data: Json }) {
  const [seed, setSeed] = useState('1');
  const phases = listOf(objectOf(props.data).phases).map((phase) => objectOf(phase));
  const run = useMemo(() => runOneBlock(props.data, seed, LIVE_BREAKS), [props.data, seed]);
  const name = (id: string, sort: 'block' | 'mob') => thingName(props.project, id, sort);
  return (
    <LiveViewFrame
      title="What the block turns into"
      fidelity="about_right"
      notes={[
        'The breaks are an example from the seed; the game rolls its own. The odds are your own.',
      ]}
      controls={<SeedBox seed={seed} onSeed={setSeed} rollLabel="Break again" />}
    >
      <ol className="flex flex-col gap-2 text-sm" data-testid="one-block-live-odds">
        {phases.map((phase, index) => (
          <li key={index} data-testid={`one-block-live-phase-${index}`}>
            <span className="font-medium">{textOf(phase.name) || `Phase ${index + 1}`}</span>{' '}
            <span className="text-muted text-xs">
              ({typeof phase.breaks === 'number' ? phase.breaks : '?'} breaks)
            </span>
            <div className="text-xs">
              {oddsOf(phase.blocks, 'block')
                .map((entry) => `${name(entry.id, 'block')} ${entry.percent}%`)
                .join(', ') || 'No blocks yet.'}
            </div>
            {textOf(phase.chest_loot) !== '' && (
              <div className="text-muted text-xs">
                A chest {percentOf(phase.chest_chance)}% of the time.
              </div>
            )}
            {listOf(phase.mobs).length > 0 && (
              <div className="text-muted text-xs">
                A mob {percentOf(phase.mob_chance)}% of the time:{' '}
                {oddsOf(phase.mobs, 'mob')
                  .map((entry) => `${name(entry.id, 'mob')} ${entry.percent}%`)
                  .join(', ')}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1">
        <span className="text-muted text-xs">The next {LIVE_BREAKS} breaks:</span>
        <ol className="flex flex-wrap gap-1 text-xs" data-testid="one-block-live-run">
          {run.map((entry, index) => (
            <li
              key={index}
              className={`rounded border px-1 ${entry.newPhase ? 'border-accent' : 'border-border'}`}
              title={entry.newPhase ? `Phase ${entry.phase + 1} starts` : undefined}
              data-phase={entry.phase}
            >
              {entry.chest ? 'Chest' : entry.block === null ? '?' : name(entry.block, 'block')}
              {entry.mob !== null && ` + ${name(entry.mob, 'mob')}`}
            </li>
          ))}
        </ol>
      </div>
    </LiveViewFrame>
  );
}

/** A weighted list of blocks or mobs. */
function WeightedList(props: {
  project: Project;
  target: Target;
  suggest: StudioProps['suggest'];
  list: Json[];
  sort: 'block' | 'mob';
  testId: string;
  onChange(next: Json[]): void;
}) {
  const key = props.sort;
  const fallback = props.sort === 'block' ? 'minecraft:stone' : 'minecraft:pig';
  return (
    <div className="flex flex-col gap-1">
      <ol className="flex flex-col gap-1">
        {props.list.map((entry, index) => {
          const object = objectOf(entry);
          const change = (patch: Record<string, Json>) =>
            props.onChange(
              props.list.map((item, at) => (at === index ? { ...objectOf(item), ...patch } : item)),
            );
          return (
            <li key={index} className="flex flex-wrap items-end gap-2">
              <ThingField
                project={props.project}
                target={props.target}
                sort={props.sort === 'block' ? 'block' : 'mob'}
                label={props.sort === 'block' ? 'Block' : 'Mob'}
                value={textOf(object[key])}
                testId={`${props.testId}-${index}`}
                suggest={props.suggest}
                onChange={(value) => change({ [key]: value ?? fallback })}
              />
              <NumberField
                label="How often"
                value={object.weight}
                integer
                testId={`${props.testId}-${index}-weight`}
                onCommit={(value) => change({ weight: Math.max(1, value ?? 1) })}
              />
              <button
                type="button"
                aria-label={`Remove ${props.sort} ${index + 1}`}
                className={iconButtonClass}
                data-testid={`${props.testId}-${index}-remove`}
                onClick={() => props.onChange(props.list.filter((_, at) => at !== index))}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start text-xs"
        data-testid={`${props.testId}-add`}
        onClick={() => props.onChange([...props.list, { [key]: fallback, weight: 1 }])}
      >
        <Plus size={12} aria-hidden />
        {props.sort === 'block' ? 'Add a block' : 'Add a mob'}
      </Button>
    </div>
  );
}

/** One phase's editor. */
function PhaseCard(props: {
  studio: StudioProps;
  index: number;
  count: number;
  phase: Json;
  set: SetPath;
  phases: Json[];
}) {
  const { index, studio, set } = props;
  const phase = objectOf(props.phase);
  const at = (key: string) => ['phases', index, key];
  const testId = `one-block-phase-${index}`;
  return (
    <li className="flex flex-col gap-2 rounded border border-border p-2" data-testid={testId}>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="Phase name"
          value={phase.name}
          testId={`${testId}-name`}
          onCommit={(value) => set(at('name'), value ?? '', typingKey(`/phases/${index}/name`))}
        />
        <NumberField
          label="Breaks in this phase"
          value={phase.breaks}
          integer
          testId={`${testId}-breaks`}
          onCommit={(value) =>
            set(at('breaks'), Math.max(1, value ?? 1), typingKey(`/phases/${index}/breaks`))
          }
        />
        <button
          type="button"
          aria-label={`Move phase ${index + 1} up`}
          className={iconButtonClass}
          disabled={index === 0}
          onClick={() => set(['phases'], moved(props.phases, index, index - 1))}
        >
          <ArrowUp size={12} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Move phase ${index + 1} down`}
          className={iconButtonClass}
          disabled={index === props.count - 1}
          onClick={() => set(['phases'], moved(props.phases, index, index + 1))}
        >
          <ArrowDown size={12} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove phase ${index + 1}`}
          className={iconButtonClass}
          data-testid={`${testId}-remove`}
          disabled={props.count === 1}
          onClick={() =>
            set(
              ['phases'],
              props.phases.filter((_, entry) => entry !== index),
            )
          }
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      <span className="text-muted text-xs">It turns into</span>
      <WeightedList
        project={studio.project}
        target={studio.target}
        suggest={studio.suggest}
        list={listOf(phase.blocks)}
        sort="block"
        testId={`${testId}-block`}
        onChange={(next) => set(at('blocks'), next)}
      />
      <span className="text-muted text-xs">Chests now and then</span>
      <div className="flex flex-wrap items-end gap-2">
        <PercentField
          label="Chance of a chest"
          value={phase.chest_chance}
          testId={`${testId}-chest-chance`}
          onCommit={(chance) => set(at('chest_chance'), chance)}
        />
        <NamedIdField
          project={studio.project}
          label="What is in the chest"
          value={textOf(phase.chest_loot)}
          registry="loot_table"
          kinds={[LOOT_TABLE_KIND]}
          testId={`${testId}-chest-loot`}
          emptyLabel="No chests"
          suggest={studio.suggest}
          vanilla={(id) => id.includes(':chests/')}
          onChange={(value) => set(at('chest_loot'), value)}
        />
      </div>
      <span className="text-muted text-xs">Mobs now and then</span>
      <PercentField
        label="Chance of a mob"
        value={phase.mob_chance}
        testId={`${testId}-mob-chance`}
        onCommit={(chance) => set(at('mob_chance'), chance)}
      />
      <WeightedList
        project={studio.project}
        target={studio.target}
        suggest={studio.suggest}
        list={listOf(phase.mobs)}
        sort="mob"
        testId={`${testId}-mob`}
        onChange={(next) => set(at('mobs'), next.length === 0 ? undefined : next)}
      />
    </li>
  );
}

/** A new phase after `count` others. */
export function newPhase(count: number): Json {
  return {
    name: `Phase ${count + 1}`,
    breaks: 100,
    blocks: [{ block: 'minecraft:stone', weight: 1 }],
    mob_chance: 0,
    chest_chance: 0,
  };
}

/** The One Block Studio. */
export default function OneBlockStudio(props: StudioProps) {
  const { element, onChange, project, suggest } = props;
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const phases = listOf(data.phases);
  return (
    <GamesStudioShell studio={props} label="One Block Studio" testId="one-block">
      <Section title="What the block turns into" testId="one-block-live">
        <OneBlockLook project={project} data={element.data} />
      </Section>
      <Section title="The magic block" testId="one-block-place">
        <PosField
          label="Where it is"
          value={data.at}
          testId="one-block-at"
          onCommit={(pos) => set(['at'], pos)}
        />
        <NamedIdField
          project={project}
          label="World"
          value={textOf(data.dimension)}
          registry="dimension"
          kinds={[DIMENSION_KIND]}
          testId="one-block-dimension"
          emptyLabel="The Overworld"
          suggest={suggest}
          vanilla={(id) => id in DIMENSION_LABELS && id !== 'minecraft:overworld'}
          onChange={(value) =>
            set(['dimension'], value === 'minecraft:overworld' ? undefined : value)
          }
        />
        <CheckField
          label="Start over after the last phase"
          checked={data.loop === true}
          testId="one-block-loop"
          onChange={(checked) => set(['loop'], checked)}
        />
        <CheckField
          label="Say each phase's name in chat when it starts"
          checked={data.announce === true}
          testId="one-block-announce"
          onChange={(checked) => set(['announce'], checked)}
        />
      </Section>
      <Section title="Phases" testId="one-block-phases">
        <ol className="flex flex-col gap-2">
          {phases.map((phase, index) => (
            <PhaseCard
              key={index}
              studio={props}
              index={index}
              count={phases.length}
              phase={phase}
              phases={phases}
              set={set}
            />
          ))}
        </ol>
        <Button
          className="self-start text-xs"
          data-testid="one-block-phase-add"
          disabled={phases.length >= 64}
          onClick={() => set(['phases'], [...phases, newPhase(phases.length)])}
        >
          <Plus size={12} aria-hidden />
          Add a phase
        </Button>
      </Section>
    </GamesStudioShell>
  );
}
