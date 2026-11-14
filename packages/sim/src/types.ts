/**
 * The interfaces of the Try it simulation (ADR 0085), fixed by B386 so that the sim world and
 * blocks, the sim player and the view renderer can be built in parallel against them. Only types
 * and constants live here; behaviour lives in the briefs that follow. Block names are resource
 * locations such as `mymod:ruby_block`; positions are whole block coordinates inside the area
 * unless a comment says otherwise.
 */

/**
 * One block in the world: its resource location and its block state properties, all as strings
 * (`{ facing: "north", half: "bottom" }`), as a blockstate file would name them.
 */
export interface BlockState {
  /** The block's resource location, for example `mymod:ruby_block` or `minecraft:stone`. */
  readonly name: string;
  /** The state properties by name; empty for a block without any. */
  readonly properties: Readonly<Record<string, string>>;
}

/**
 * An axis-aligned box in block units, relative to the block's own corner: `[minX, minY, minZ,
 * maxX, maxY, maxZ]`, each from 0 to 1 for a box inside the block.
 */
export type Box = readonly [
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
];

/** The boxes of a block state, as the player collides with and points at them. */
export interface BlockShapes {
  /** The boxes the player cannot walk through; empty for a block that does not block. */
  collision(state: BlockState): readonly Box[];
  /** The boxes a pointing ray hits and the selection outline follows; empty when it cannot be pointed at. */
  outline(state: BlockState): readonly Box[];
}

/** The lowered output files of a project by path (`assets/...`, `data/...`), text or bytes. */
export type SimFiles = ReadonlyMap<string, string | Uint8Array>;

/** A block position inside the area, in whole blocks. */
export interface BlockPos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A face of a block, named by the direction it looks. */
export type Face = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

/** A point or direction in world space, in blocks. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A moving thing the view draws: the player or a mob. */
export interface EntitySnapshot {
  /** A number that stays the same for this entity while it exists. */
  readonly id: number;
  /** The entity type's resource location, for example `mymod:ruby_golem`. */
  readonly type: string;
  /** Where its feet are. */
  readonly position: Vec3;
  /** Where its feet were one tick ago, for drawing in between ticks. */
  readonly previousPosition: Vec3;
  /** The way it faces, in degrees (0 faces south, 90 faces west). */
  readonly yaw: number;
  /** How far it looks up or down, in degrees (negative is up). */
  readonly pitch: number;
  /**
   * True when it moved in the last tick, so the view plays its `walk` (or `fly`) animation
   * instead of `idle` (B393). Absent for the player.
   */
  readonly walking?: boolean;
}

/** A visible or audible effect the simulation asks the view to show. */
export interface SimEffect {
  /**
   * What kind of effect it is: one particle, a sound, a chip (a short label such as "Glowing
   * for 3 seconds", ADR 0085 D6) or a mob animation to play once (B396).
   */
  readonly kind: 'particle' | 'sound' | 'chip' | 'animation';
  /** The particle type or sound event id, the chip's plain words, or the animation's name. */
  readonly id: string;
  /** Where it happens, when it has a place. */
  readonly position?: Vec3;
  /** A particle's starting speed in blocks per tick (B396). */
  readonly velocity?: Vec3;
  /**
   * A particle's vanilla options object (`{ type, color, scale }`, ADR 0080 D5) when the action
   * gave one; `id` is then its `type` (B396).
   */
  readonly options?: Readonly<Record<string, unknown>>;
  /** A sound's volume and pitch (B396); absent means 1. */
  readonly volume?: number;
  readonly pitch?: number;
  /**
   * Who a chip or an animation is about: `player`, or a mob's entity id (B396). Absent for a
   * chip about nobody in particular.
   */
  readonly target?: 'player' | number;
  /** An animation's GeckoLib controller (B396). */
  readonly controller?: string;
  /** Where the effect comes from, as the trace entry that made it (B396). */
  readonly origin?: SimOrigin;
}

/** What a log line points back to, so the side panel can link to the rule card or Studio field. */
export interface SimOrigin {
  /** The element id the line comes from, for example `mymod:ruby_block`. */
  readonly elementId?: string;
  /** A JSON pointer into that element, when one field is meant. */
  readonly pointer?: string;
  /** The event of the element the line is about, when an event ran (B396). */
  readonly eventId?: string;
  /**
   * The rule key, when the event is one Rules generated (`<subject>_rules_<trigger>`, ADR 0082
   * D3) and the rule is known (B396).
   */
  readonly ruleKey?: string;
  /** The rule book of {@link ruleKey}, when known (B396). */
  readonly ruleBook?: string;
}

/** One line of the "What happened" panel (ADR 0085 D8). */
export interface SimLogLine {
  /** The tick it happened in. */
  readonly tick: number;
  /** The line in plain words, by display name. */
  readonly text: string;
  /** True for an "Only in Minecraft" line (ADR 0085 D5). */
  readonly onlyInMinecraft: boolean;
  /** Where the line comes from, when known. */
  readonly origin?: SimOrigin;
}

/**
 * Where the simulation writes what it did. Anything the simulation does not handle goes through
 * `onlyInMinecraft`: a silent no-op is refused at review (ADR 0085 D5).
 */
export interface SimLog {
  /** Writes an ordinary line of the "What happened" panel. */
  info(text: string, origin?: SimOrigin): void;
  /**
   * Says out loud that something exists only in Minecraft, for example `run function
   * mymod:greet`. The panel shows it as "Only in Minecraft: ...".
   */
  onlyInMinecraft(what: string, origin?: SimOrigin): void;
}

/** An event the world source sends to its listeners (ADR 0085 D14). */
export type WorldEvent =
  | {
      /** A block changed. */
      readonly type: 'blockChanged';
      readonly pos: BlockPos;
      /** The new state; `null` for air. */
      readonly state: BlockState | null;
    }
  | {
      /** The entities after a tick. */
      readonly type: 'entities';
      readonly entities: readonly EntitySnapshot[];
    }
  | {
      /** An effect to show. */
      readonly type: 'effect';
      readonly effect: SimEffect;
    }
  | {
      /** A line for the log panel. */
      readonly type: 'log';
      readonly line: SimLogLine;
    };

/** What a player does, sent to `WorldSource.act` (ADR 0085 D14). */
export type PlayerAction =
  | {
      /** Move for one tick: walking input and the look direction. */
      readonly type: 'move';
      /** Forward (1) or back (-1), and right (1) or left (-1). */
      readonly forward: number;
      readonly strafe: number;
      readonly jump: boolean;
      readonly sneak: boolean;
      /** Toggles flying when true. */
      readonly toggleFly: boolean;
      readonly yaw: number;
      readonly pitch: number;
    }
  | {
      /** Place the held block against a face of a block. */
      readonly type: 'place';
      readonly pos: BlockPos;
      readonly face: Face;
      /** Where on the face the player pointed, in block units from 0 to 1. */
      readonly hit: Vec3;
      /** The block to place; the hotbar's choice. */
      readonly block: string;
    }
  | {
      /** Break the block. */
      readonly type: 'break';
      readonly pos: BlockPos;
    }
  | {
      /**
       * Use (right-click) the block with an empty hand or the held item. The source decides what
       * happens, as the game does: a block that reacts to a hand (a door, a button) is used
       * unless the player sneaks; otherwise a held block is placed against the face and a held
       * spawn egg hatches its mob there (B390).
       */
      readonly type: 'use';
      readonly pos: BlockPos;
      readonly face: Face;
      readonly hit: Vec3;
      /** The held thing's id (a block or a spawn egg), when the hand is not empty. */
      readonly item?: string;
    }
  | {
      /** Hit (left-click) a mob by its id (B390). */
      readonly type: 'hit';
      readonly entity: number;
    }
  | {
      /**
       * Use (right-click) a mob by its id, with the held thing's id when the hand is not empty
       * (B396): it fires the mob's `msm:on_interact`.
       */
      readonly type: 'interact';
      readonly entity: number;
      readonly item?: string;
    }
  | {
      /** "Clear the area": every block, mob, timer and effect goes (ADR 0085 D13). */
      readonly type: 'clear';
    }
  | {
      /** Use a Try it tool such as Grow or Power on a block. */
      readonly type: 'tool';
      readonly tool: string;
      readonly pos: BlockPos;
    };

/** Receives the events of a `WorldSource`. */
export type WorldListener = (event: WorldEvent) => void;

/**
 * The only thing the view talks to (ADR 0085 D14): block changes, entity snapshots, effects and
 * log lines come out; player actions go in. `@msm/sim` is the one implementation now.
 */
export interface WorldSource {
  /** Starts listening. Returns a function that stops it. */
  subscribe(listener: WorldListener): () => void;
  /** Sends a player action in. */
  act(action: PlayerAction): void;
}

/** The area's width along x, in blocks (ADR 0085 L15). */
export const AREA_SIZE_X = 48;
/** The area's depth along z, in blocks. */
export const AREA_SIZE_Z = 48;
/** The area's height along y, in blocks. */
export const AREA_SIZE_Y = 32;
