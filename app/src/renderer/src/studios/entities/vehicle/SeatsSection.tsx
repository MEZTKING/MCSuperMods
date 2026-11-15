/**
 * The Vehicle Studio's "Seats" section (B419, ADR 0091 D1): a seat plan seen from above with the
 * hitbox and the front marked, where each seat is a numbered marker dragged into place (one undo
 * step per drag; the arrow keys move a focused marker by 0.05 blocks), and per seat its offset
 * fields, the weapons it fires and Remove. The first seat drives. With no seats written, the
 * plan shows the runtime's default seat; dragging or adding writes the list.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { Plus, X } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { Button, iconButtonClass } from '../../../components/ui/Button';
import { typingKey } from '../../../forms/context';
import { asObject, pointerOf } from '../../blocks-items/blocks-items-model';
import { ProblemsAt } from '../../blocks-items/parts';
import { Section } from '../../worldgen/parts';
import { OffsetFields, type VehicleSectionProps } from './parts';
import {
  effectiveSeatOffsets,
  planScale,
  planToSeat,
  round2,
  type SeatOffset,
  seatsForCount,
  seatsOf,
  seatToPlan,
  sizeOf,
  stringList,
  weaponIds,
} from './vehicle-model';

/** The plan's size in drawing units. */
export const PLAN_SIZE = 200;
/** The arrow keys' step in blocks. */
const KEY_STEP = 0.05;

let dragCounter = 0;

/** The seats written as a list (the default seat made explicit when there is none). */
function writtenSeats(data: Json): Json[] {
  const seats = seatsOf(data);
  return seats.length > 0
    ? seats
    : effectiveSeatOffsets(data).map((offset) => ({ offset: [...offset] }));
}

/** The seat plan: hitbox from above, front up, draggable numbered seats. */
export function SeatPlan(props: {
  data: Json;
  onMove(index: number, x: number, z: number, coalesce: string): void;
}) {
  const { data } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; key: string } | null>(null);
  const offsets = effectiveSeatOffsets(data);
  const scale = planScale(data, PLAN_SIZE);
  const [width] = sizeOf(data);
  const half = (width / 2) * scale;
  const centre = PLAN_SIZE / 2;
  const toPlan = (event: PointerEvent<SVGElement>) => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * PLAN_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * PLAN_SIZE,
    };
  };
  const onKey = (index: number, offset: SeatOffset) => (event: KeyboardEvent<SVGElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    props.onMove(
      index,
      round2(offset[0] + move[0]),
      round2(offset[2] + move[1]),
      typingKey(`/seats/${index}/offset`),
    );
  };
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${PLAN_SIZE} ${PLAN_SIZE}`}
      className="h-48 w-48 touch-none rounded border border-border bg-bg"
      data-testid="vehicle-seat-plan"
      onPointerMove={(event) => {
        const current = drag.current;
        if (current === null) return;
        const point = toPlan(event);
        if (point === null) return;
        const [x, z] = planToSeat(point, scale, PLAN_SIZE);
        props.onMove(current.index, x, z, current.key);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <title>
        Seat plan seen from above, front at the top. Drag a seat, or focus it and use the arrow
        keys.
      </title>
      <rect
        x={centre - half}
        y={centre - half}
        width={half * 2}
        height={half * 2}
        className="fill-none stroke-current text-muted"
        strokeDasharray="4 3"
      />
      <path
        d={`M${centre - 8} ${centre - half - 4} L${centre} ${centre - half - 12} L${centre + 8} ${centre - half - 4}`}
        className="fill-none stroke-current text-muted"
      />
      <text x={centre} y={12} textAnchor="middle" className="fill-current text-[9px] text-muted">
        Front
      </text>
      {offsets.map((offset, index) => {
        const [x, y] = seatToPlan(offset, scale, PLAN_SIZE);
        return (
          // biome-ignore lint/a11y/useSemanticElements: an SVG marker cannot be a native button
          <g
            key={index}
            role="button"
            tabIndex={0}
            aria-label={`Seat ${index + 1}${index === 0 ? ' (driver)' : ''}: ${offset[0]} right, ${offset[2]} forwards`}
            data-testid={`vehicle-seat-marker-${index}`}
            className="cursor-grab outline-none focus-visible:[&>circle]:stroke-[3]"
            onPointerDown={(event) => {
              event.preventDefault();
              dragCounter += 1;
              drag.current = { index, key: typingKey(`/seats@drag${dragCounter}`) };
              svgRef.current?.setPointerCapture?.(event.pointerId);
            }}
            onKeyDown={onKey(index, offset)}
          >
            <circle
              cx={x}
              cy={y}
              r={9}
              className={`stroke-current ${index === 0 ? 'fill-accent text-accent' : 'fill-panel text-fg'}`}
            />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              className={`pointer-events-none text-[10px] ${index === 0 ? 'fill-white' : 'fill-current'}`}
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The "Seats" section. */
export function SeatsSection(props: VehicleSectionProps) {
  const { data, set, problems } = props;
  const written = seatsOf(data).length > 0;
  const weapons = weaponIds(data);
  const [note, setNote] = useState<string | null>(null);
  const move = (index: number, x: number, z: number, coalesce: string) => {
    const seats = writtenSeats(data).map((seat) => asObject(seat));
    const seat = seats[index];
    if (seat === undefined) return;
    const y = effectiveSeatOffsets(data)[index]?.[1] ?? 0;
    seats[index] = { ...seat, offset: [x, y, z] };
    set(['seats'], seats, coalesce);
  };
  const count = effectiveSeatOffsets(data).length;
  return (
    <Section title="Seats" testId="vehicle-seats">
      <div className="flex flex-wrap items-start gap-3">
        <SeatPlan data={data} onMove={move} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {!written && (
            <p className="text-muted text-xs" data-testid="vehicle-seats-default">
              One seat on top, in the middle (the default). Drag it or add seats to choose.
            </p>
          )}
          <ol className="flex flex-col gap-2">
            {effectiveSeatOffsets(data).map((offset, index) => {
              const seat = asObject(seatsOf(data)[index]);
              const fires = Array.isArray(seat.weapons) ? stringList(seat.weapons) : null;
              return (
                <li
                  key={index}
                  className="flex flex-col gap-1 rounded border border-border p-2"
                  data-testid={`vehicle-seat-${index}`}
                >
                  <div className="flex items-center gap-1">
                    <span className="flex-1 font-medium text-xs">
                      Seat {index + 1}
                      {index === 0 ? ' (drives)' : ''}
                    </span>
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={`Remove seat ${index + 1}`}
                      disabled={!written || count === 1}
                      onClick={() =>
                        set(
                          ['seats'],
                          seatsOf(data).filter((_, at) => at !== index),
                        )
                      }
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                  {written ? (
                    <OffsetFields
                      section={props}
                      path={['seats', index, 'offset']}
                      label="Where"
                      testId={`vehicle-seat-${index}-offset`}
                    />
                  ) : (
                    <p className="text-muted text-xs">
                      {offset[0]} right, {offset[1]} up, {offset[2]} forwards
                    </p>
                  )}
                  {weapons.length > 0 && written && (
                    <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <legend className="text-muted">Fires</legend>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          data-testid={`vehicle-seat-${index}-default-weapons`}
                          checked={fires === null}
                          onChange={(event) =>
                            set(
                              ['seats', index, 'weapons'],
                              event.target.checked ? undefined : index === 0 ? weapons : [],
                            )
                          }
                        />
                        {index === 0 ? 'Every weapon (the default)' : 'Nothing (the default)'}
                      </label>
                      {fires !== null &&
                        weapons.map((id) => (
                          <label key={id} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              data-testid={`vehicle-seat-${index}-weapon-${id}`}
                              checked={fires.includes(id)}
                              onChange={(event) =>
                                set(
                                  ['seats', index, 'weapons'],
                                  event.target.checked
                                    ? weapons.filter(
                                        (entry) => entry === id || fires.includes(entry),
                                      )
                                    : fires.filter((entry) => entry !== id),
                                )
                              }
                            />
                            <span className="font-mono">{id}</span>
                          </label>
                        ))}
                    </fieldset>
                  )}
                  <ProblemsAt problems={problems} pointer={pointerOf(['seats', index])} />
                  <ProblemsAt
                    problems={problems}
                    pointer={pointerOf(['seats', index, 'weapons'])}
                  />
                </li>
              );
            })}
          </ol>
          <div className="flex items-center gap-2">
            <Button
              className="text-xs"
              data-testid="vehicle-add-seat"
              disabled={count >= 8}
              onClick={() => {
                set(
                  ['seats'],
                  seatsForCount(
                    written ? data : { ...asObject(data), seats: writtenSeats(data) },
                    count + 1,
                  ),
                );
                setNote(count + 1 === 8 ? 'Eight seats is the most a vehicle has.' : null);
              }}
            >
              <Plus size={12} aria-hidden />
              Add a seat
            </Button>
            {written && (
              <Button
                className="text-xs"
                data-testid="vehicle-default-seat"
                onClick={() => set(['seats'], undefined)}
              >
                Use the default seat
              </Button>
            )}
          </div>
          {note !== null && <p className="text-muted text-xs">{note}</p>}
          <ProblemsAt problems={problems} pointer="/seats" />
        </div>
      </div>
    </Section>
  );
}
