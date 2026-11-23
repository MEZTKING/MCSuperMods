/**
 * Area Studio (ADR 0117 D1, ADR 0113 D7; B555) for `msm:area`, loaded lazily: the area's name
 * as players see it, its world (dimension), its two corners (both inside the box, B552), and
 * "Rebuild from": the buildings placed, in order, when the area is rebuilt (the mobs and items
 * in the box are removed first).
 *
 * Live view (ADR 0119 D1): "Where the area is", the box seen from above and from the side, with
 * each building it is rebuilt from drawn at its corner at its template's size, a building that
 * reaches out of the box marked, and the box's size in blocks; it follows every edit (as in the
 * game: the box is the data's own). Try it draws the outline over its ground and fires "walks
 * in" and "walks out" (B558).
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { Plus, X } from 'lucide-react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { typingKey } from '../../forms/context';
import { LiveViewFrame } from '../../liveviews/frame/LiveViewFrame';
import { asObject, pathSetter } from '../blocks-items/blocks-items-model';
import { TextField } from '../blocks-items/parts';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import {
  type AreaBox,
  areaBoxOf,
  DIMENSION_KIND,
  DIMENSION_LABELS,
  gamesFunction,
  listOf,
  objectOf,
  type PlacedBox,
  type Pos,
  posOf,
  resetBoxes,
  STRUCTURE_KIND,
  textOf,
} from './games-model';
import { NamedIdField, PosField } from './pickers';
import { CommandLines, GamesStudioShell } from './shell';

/** The live view's drawing size in pixels. */
const VIEW = 240;

/** Whether a placed box reaches out of the area. */
export function reachesOut(area: AreaBox, box: PlacedBox): boolean {
  const size = box.size ?? [1, 1, 1];
  return box.min.some(
    (axis, at) =>
      axis < (area.min[at] as number) || axis + (size[at] as number) - 1 > (area.max[at] as number),
  );
}

/** One view (from above: x and z; from the side: x and y) of the area and its buildings. */
function BoxView(props: {
  label: string;
  area: AreaBox;
  boxes: readonly PlacedBox[];
  axes: readonly [0 | 1 | 2, 0 | 1 | 2];
  /** True when the second axis grows upwards (y). */
  up: boolean;
  testId: string;
}) {
  const { area, boxes, axes } = props;
  const [a, b] = axes;
  const lows = [area.min[a], area.min[b]] as [number, number];
  const highs = [area.max[a] + 1, area.max[b] + 1] as [number, number];
  for (const box of boxes) {
    const size = box.size ?? [1, 1, 1];
    lows[0] = Math.min(lows[0], box.min[a]);
    lows[1] = Math.min(lows[1], box.min[b]);
    highs[0] = Math.max(highs[0], box.min[a] + size[a]);
    highs[1] = Math.max(highs[1], box.min[b] + size[b]);
  }
  const pad = 2;
  const span = Math.max(highs[0] - lows[0], highs[1] - lows[1]) + pad * 2;
  const scale = VIEW / span;
  const rect = (min: Pos, size: Pos) => {
    const x = (min[a] - lows[0] + pad) * scale;
    const w = size[a] * scale;
    const h = size[b] * scale;
    const y = props.up
      ? VIEW - (min[b] - lows[1] + pad) * scale - h
      : (min[b] - lows[1] + pad) * scale;
    return { x, y, width: w, height: h };
  };
  const names = ['x', 'y', 'z'];
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        role="img"
        aria-label={props.label}
        data-testid={props.testId}
        width={VIEW}
        height={VIEW}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="rounded bg-[#2b3a24]"
      >
        <rect
          {...rect(area.min, area.size)}
          data-testid={`${props.testId}-area`}
          fill="rgba(120, 200, 255, 0.25)"
          stroke="#78c8ff"
          strokeWidth={2}
        />
        {boxes.map((box, index) => {
          const out = reachesOut(area, box);
          return (
            <rect
              key={index}
              {...rect(box.min, box.size ?? [1, 1, 1])}
              data-testid={`${props.testId}-building-${index}`}
              data-out={out}
              fill="rgba(255, 220, 120, 0.25)"
              stroke={out ? '#ff7043' : '#ffdc78'}
              strokeDasharray="4 3"
              strokeWidth={1.5}
            >
              <title>{box.label}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="text-muted text-xs">
        {props.label} ({names[a]} across, {names[b]} {props.up ? 'up' : 'down'})
      </figcaption>
    </figure>
  );
}

/** The live view; see the module comment. */
function AreaLook(props: { project: Project; data: Json }) {
  const area = areaBoxOf(props.data);
  const boxes = resetBoxes(props.project, props.data);
  const unknown = boxes.filter((box) => box.size === null).length;
  const out = boxes.filter((box) => reachesOut(area, box)).length;
  const notes: string[] = [];
  if (unknown > 0) {
    notes.push(
      'A building that is not one of your structures is drawn as one block at its corner.',
    );
  }
  return (
    <LiveViewFrame title="Where the area is" fidelity="about_right" notes={notes}>
      <div className="flex flex-wrap gap-3" data-testid="area-live-look">
        <BoxView
          label="From above"
          area={area}
          boxes={boxes}
          axes={[0, 2]}
          up={false}
          testId="area-live-top"
        />
        <BoxView
          label="From the side"
          area={area}
          boxes={boxes}
          axes={[0, 1]}
          up
          testId="area-live-side"
        />
      </div>
      <p className="text-sm" data-testid="area-live-size">
        {area.size.join(' × ')} blocks ({area.blocks.toLocaleString('en-GB')} in all), from{' '}
        {area.min.join(', ')} to {area.max.join(', ')}.
      </p>
      {out > 0 && (
        <p className="text-warning text-xs" data-testid="area-live-out">
          {out === 1 ? 'A building reaches' : `${out} buildings reach`} out of the area: rebuilding
          does not clear what is outside it first.
        </p>
      )}
    </LiveViewFrame>
  );
}

/** The Area Studio. */
export default function AreaStudio(props: StudioProps) {
  const { element, onChange, project, suggest } = props;
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const structures = listOf(objectOf(data.reset).structures);
  const box = areaBoxOf(element.data);
  const setStructures = (next: Json[]) =>
    set(['reset'], next.length === 0 ? undefined : { structures: next });
  return (
    <GamesStudioShell studio={props} label="Area Studio" testId="area">
      <Section title="Where the area is" testId="area-live">
        <AreaLook project={project} data={element.data} />
      </Section>
      <Section title="Area" testId="area-general">
        <TextField
          label="Area name"
          value={data.name}
          testId="area-name"
          placeholder="Arena"
          onCommit={(value) => set(['name'], value, typingKey('/name'))}
        />
        <NamedIdField
          project={project}
          label="World"
          value={textOf(data.dimension)}
          registry="dimension"
          kinds={[DIMENSION_KIND]}
          testId="area-dimension"
          emptyLabel="Pick a world"
          suggest={suggest}
          vanilla={(id) => id in DIMENSION_LABELS}
          onChange={(value) => set(['dimension'], value ?? 'minecraft:overworld')}
        />
        <PosField
          label="One corner"
          value={data.from}
          testId="area-from"
          onCommit={(pos) => set(['from'], pos)}
        />
        <PosField
          label="The opposite corner"
          value={data.to}
          testId="area-to"
          onCommit={(pos) => set(['to'], pos)}
        />
        <p className="text-muted text-xs">Both corner blocks are inside the area.</p>
      </Section>
      <Section title="Rebuild from" testId="area-reset">
        {structures.length === 0 && (
          <p className="text-muted text-xs">
            Nothing: rebuilding only clears the mobs and items in the area.
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {structures.map((entry, index) => {
            const object = objectOf(entry);
            const update = (key: string, value: Json | undefined) =>
              setStructures(
                structures.map((item, at) =>
                  at === index
                    ? value === undefined
                      ? (({ [key]: _, ...rest }) => rest)(objectOf(item))
                      : { ...objectOf(item), [key]: value }
                    : item,
                ),
              );
            return (
              <li
                key={index}
                className="flex flex-wrap items-end gap-2 rounded border border-border p-2"
                data-testid={`area-reset-${index}`}
              >
                <NamedIdField
                  project={project}
                  label="Building"
                  value={textOf(object.structure)}
                  registry="structure"
                  kinds={[STRUCTURE_KIND]}
                  testId={`area-reset-${index}-structure`}
                  emptyLabel="Pick a building"
                  suggest={suggest}
                  onChange={(value) => update('structure', value ?? '')}
                />
                <PosField
                  label="Its corner"
                  value={object.at}
                  fallback={box.min}
                  testId={`area-reset-${index}-at`}
                  onCommit={(pos) => update('at', pos)}
                />
                <button
                  type="button"
                  aria-label={`Remove building ${index + 1}`}
                  className={iconButtonClass}
                  data-testid={`area-reset-${index}-remove`}
                  onClick={() => setStructures(structures.filter((_, at) => at !== index))}
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
        <Button
          className="self-start text-xs"
          data-testid="area-reset-add"
          onClick={() => setStructures([...structures, { structure: '', at: [...posOf(box.min)] }])}
        >
          <Plus size={12} aria-hidden />
          Add a building
        </Button>
        <p className="text-muted text-xs">
          Rules rebuild it (“Reset an area”) and react to players walking in and out.
        </p>
        <CommandLines
          testId="area-commands"
          lines={[
            `/function ${gamesFunction(element.id, 'area', structures.length > 0 ? 'reset' : 'clear')}`,
          ]}
        />
      </Section>
    </GamesStudioShell>
  );
}
