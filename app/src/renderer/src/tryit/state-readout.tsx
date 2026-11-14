/**
 * The state readout of Try it (B390): a visually hidden element, `tryit-state`, that says in
 * words and data attributes where the player is, what is selected and pointed at, how many
 * blocks, mobs and particles there are and the last log line. End-to-end tests read it (looks
 * are checked at most as "something was drawn", limit L17); screen readers hear it politely.
 */

import type { BlockState, SimLogLine, Vec3 } from '@msm/sim';

/** What the readout shows. */
export interface TryItReadout {
  readonly position: Vec3;
  readonly flying: boolean;
  readonly blocks: number;
  readonly entities: number;
  readonly particles: number;
  readonly tick: number;
  readonly paused: boolean;
  readonly speed: number;
  /** The selected hotbar thing's id and name, when the slot is not empty. */
  readonly selected?: { readonly id: string; readonly name: string };
  /** The pointed block's state, the floor, or a mob's type. */
  readonly pointed?:
    | { readonly kind: 'block'; readonly state: BlockState }
    | { readonly kind: 'floor' }
    | { readonly kind: 'entity'; readonly type: string };
  readonly lastLine?: SimLogLine;
}

/** A block state as `name[key=value,...]`, keys sorted. */
export function stateText(state: BlockState): string {
  const keys = Object.keys(state.properties).sort();
  if (keys.length === 0) return state.name;
  return `${state.name}[${keys.map((key) => `${key}=${state.properties[key]}`).join(',')}]`;
}

/** What the pointer is on, in text. */
export function pointedText(pointed: TryItReadout['pointed']): string {
  if (pointed === undefined) return 'nothing';
  if (pointed.kind === 'floor') return 'the floor';
  if (pointed.kind === 'entity') return `mob ${pointed.type}`;
  return stateText(pointed.state);
}

const round = (value: number): string => value.toFixed(2);

/** The readout element. */
export function StateReadout({ readout }: { readout: TryItReadout }) {
  const { position } = readout;
  const where = `${round(position.x)} ${round(position.y)} ${round(position.z)}`;
  const line = readout.lastLine;
  const lineText =
    line === undefined ? '' : line.onlyInMinecraft ? `Only in Minecraft: ${line.text}` : line.text;
  return (
    <output
      data-testid="tryit-state"
      aria-live="polite"
      className="sr-only"
      data-position={where}
      data-flying={String(readout.flying)}
      data-blocks={readout.blocks}
      data-entities={readout.entities}
      data-particles={readout.particles}
      data-tick={readout.tick}
      data-paused={String(readout.paused)}
      data-speed={readout.speed}
      data-selected={readout.selected?.id ?? ''}
      data-pointed={pointedText(readout.pointed)}
      data-last-log={lineText}
    >
      {`At ${where}${readout.flying ? ', flying' : ''}. ` +
        `${readout.blocks} block${readout.blocks === 1 ? '' : 's'} placed, ` +
        `${readout.entities} mob${readout.entities === 1 ? '' : 's'}. ` +
        `Holding ${readout.selected?.name ?? 'nothing'}. ` +
        `Pointing at ${pointedText(readout.pointed)}. ` +
        (lineText === '' ? '' : `Last: ${lineText}`)}
    </output>
  );
}
