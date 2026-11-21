/**
 * The messages between Try it's script bridge and the script runtime (B400): what the bridge
 * sends ({@link ScriptRuntimeInit}, {@link ScriptRequest}) and what comes back
 * ({@link ScriptResponse}). Everything is plain JSON (structured-clone safe), so the same messages
 * go to a Web Worker in the app and to an in-process runtime in tests.
 *
 * Values in event data are JSON with four tagged forms the runtime turns into API objects:
 * `{ $pos: [x, y, z] }` a `Pos`, `{ $entity: EntityRef }` an `Entity` or `Player`,
 * `{ $block: { pos, state } }` a `BlockRef` and `{ $item: { id, count } }` an `ItemRef`; `null`
 * is a member the event does not have (`undefined` to the script).
 */
import type { ScriptApiDescription } from './api.js';

/** A position as three numbers. */
export type XYZ = readonly [number, number, number];

/** Who an entity value is: the player, a mob of the area, or a mob that is gone (a death). */
export type EntityRef =
  | { readonly kind: 'player' }
  | { readonly kind: 'mob'; readonly id: number }
  | { readonly kind: 'gone'; readonly mob: MobSnapshot };

/** A value of event data (see the module comment). */
export type EncodedValue =
  | null
  | boolean
  | number
  | string
  | readonly EncodedValue[]
  | { readonly $pos: XYZ }
  | { readonly $entity: EntityRef }
  | { readonly $block: { readonly pos: XYZ; readonly state: string } }
  | { readonly $item: { readonly id: string; readonly count: number } }
  | { readonly [key: string]: EncodedValue };

/** A mob as scripts see it. */
export interface MobSnapshot {
  readonly id: number;
  readonly type: string;
  readonly name: string;
  readonly pos: XYZ;
}

/** The player as scripts see them. */
export interface PlayerSnapshot {
  readonly name: string;
  /** The feet, exactly. */
  readonly pos: XYZ;
  readonly sneaking: boolean;
  /** The item in the main hand, if any. */
  readonly held?: string;
  /** The stacks of the area's simple inventory. */
  readonly items: readonly { readonly id: string; readonly count: number }[];
}

/** The whole area: `palette[0]` is air; cell index `(y * sizeZ + z) * sizeX + x`. */
export interface WorldSnapshot {
  readonly size: XYZ;
  readonly palette: readonly string[];
  readonly cells: readonly number[];
}

/** What changed since the last message, sent with every request. */
export interface WorldSync {
  readonly tick: number;
  readonly player: PlayerSnapshot;
  readonly mobs: readonly MobSnapshot[];
  /** The whole area (the first message, and after "Clear the area" or a new ground). */
  readonly full?: WorldSnapshot;
  /** Blocks changed since the last message: x, y, z and the state (`''` for air). */
  readonly changes?: readonly (readonly [number, number, number, string])[];
  /**
   * How chances of rules are decided now (B401, the area's "Run every time"): `always`,
   * `never` or `random` (seeded); absent is `random`.
   */
  readonly chance?: 'random' | 'always' | 'never';
}

/** One script as the runtime loads it, in load order. */
export interface ScriptEntry {
  /** `<namespace>:<path>`, as `require` resolves it. */
  readonly id: string;
}

/** What a runtime starts with. */
export interface ScriptRuntimeInit {
  readonly api: ScriptApiDescription;
  /** `msm.version`. */
  readonly version: string;
  /** The scripts in load order (mod id, then path). */
  readonly scripts: readonly ScriptEntry[];
  /** Data stores kept from before a restart: `world` and entity UUIDs, key to value. */
  readonly stores: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly sync: WorldSync;
  /** The seed of rules' chances (B401); default 1. */
  readonly seed?: number;
}

/** A request to the runtime. */
export type ScriptRequest =
  | { readonly type: 'load' }
  | {
      readonly type: 'event';
      readonly name: string;
      readonly data: Readonly<Record<string, EncodedValue>>;
      readonly sync: WorldSync;
    }
  | {
      readonly type: 'action';
      readonly handler: string;
      readonly data: Readonly<Record<string, EncodedValue>>;
      readonly sync: WorldSync;
    }
  | { readonly type: 'tick'; readonly sync: WorldSync };

/** Something a script did that the bridge applies to the area. */
export type ScriptOp =
  | { readonly op: 'setBlock'; readonly script: string; readonly pos: XYZ; readonly state: string }
  | {
      readonly op: 'particle';
      readonly script: string;
      readonly particle: string | Readonly<Record<string, unknown>>;
      readonly pos: XYZ;
      readonly count: number;
      readonly spread: number;
      readonly speed: number;
      readonly motion?: XYZ;
    }
  | {
      readonly op: 'sound';
      readonly script: string;
      readonly id: string;
      readonly pos: XYZ;
      readonly volume: number;
      readonly pitch: number;
    }
  | { readonly op: 'message'; readonly script: string; readonly text: string }
  | { readonly op: 'give'; readonly script: string; readonly item: string; readonly count: number }
  | {
      readonly op: 'store';
      /** The script that wrote it (B401), when one was running. */
      readonly script?: string;
      readonly owner: string;
      readonly key: string;
      readonly value?: unknown;
    };

/** A line for "What happened". */
export type ScriptLine =
  | {
      readonly kind: 'log';
      readonly level: 'info' | 'warn' | 'error';
      readonly script: string;
      readonly text: string;
    }
  /** A member only the game has (said once per script and member). */
  | { readonly kind: 'only'; readonly script: string; readonly member: string }
  | {
      readonly kind: 'error';
      readonly script: string;
      readonly where: string;
      readonly message: string;
    }
  /** A step of a rule in a script Rules generated (B401, {@link RuleStep}). */
  | { readonly kind: 'rule'; readonly script: string; readonly step: RuleStep };

/**
 * What a rule of a generated Rules script did at one of its steps (B401). The script is
 * instrumented in place by `instrumentRuleScript` (`rule-steps.ts`) at the `// rule:<key>`
 * markers of ADR 0082 D3, and the shim reports each step through the `msm:try-it` hooks.
 */
export type RuleStep =
  /** The rule started from a Script API event (rules run by `run_script` are said by the action). */
  | { readonly at: 'start'; readonly event: string }
  /** An `if` step's conditions, or the rule's `only if` conditions, were checked. */
  | {
      readonly at: 'check';
      readonly which: 'if' | 'only';
      readonly met: boolean;
      /** The `if` step has `otherwise` steps. */
      readonly otherwise?: boolean;
    }
  /** A `chance` condition was rolled. */
  | {
      readonly at: 'chance';
      readonly percent: number;
      readonly met: boolean;
      readonly mode: 'random' | 'always' | 'never';
    }
  /** A `repeat` step starts its time `time` (from 1) of `of`, or finished when `time > of`. */
  | { readonly at: 'repeat'; readonly time: number; readonly of: number }
  /** A `for each player` step found `count` players. */
  | { readonly at: 'each'; readonly count: number }
  /** A `wait` step started: the rule goes on `ticks` later on the area's clock. */
  | { readonly at: 'wait'; readonly ticks: number; readonly due: number }
  /** A wait ended and the rule goes on. */
  | { readonly at: 'resume'; readonly ticks: number }
  /** After a wait, the player or mob of the trigger was gone, so the rule stopped. */
  | { readonly at: 'gone' }
  /** The rule stopped with an error; `during` names the step it was in, in words. */
  | { readonly at: 'error'; readonly message: string; readonly during?: string };

/** What scripts did and said, with the rule key when a rule of a generated script did it (B401). */
export type ScriptStep = (ScriptOp | ScriptLine) & { readonly rule?: string };

/** What a request came to. */
export interface ScriptResponse {
  /** What the scripts did ({@link ScriptOp}) and said ({@link ScriptLine}), in order. */
  readonly steps: readonly ScriptStep[];
  /** A handler called `cancel()`. */
  readonly cancelled: boolean;
  /** A handler called `keepBlocks()` (explosions). */
  readonly keepBlocks: boolean;
  /** The scripts listening for each event, by event name. */
  readonly listeners: Readonly<Record<string, readonly string[]>>;
  /** The action handler ids defined. */
  readonly actions: readonly string[];
  /** The tick of the next `msm.schedule` callback, or `null`. */
  readonly nextDue: number | null;
  /** The script was stopped after its time budget; set only by a runner. */
  readonly timedOut?: { readonly ms: number };
}

/** A compiled script module: CommonJS with `msm` as a global (ADR 0031 D3). */
export type ScriptModuleFn = (
  exports: Record<string, unknown>,
  require: (id: string) => unknown,
  module: { exports: unknown },
  msm: unknown,
) => void;

/** How a probe found a member: it works, it says it is only in Minecraft, or it is not there. */
export type ProbeResult = 'implemented' | 'logged' | 'missing';
