/**
 * The script bridge (B400, ADR 0085 D9 slice 4): the area's side of the scripts. It sends the
 * Script API events the simulation fires to a {@link ScriptRunner} with what changed in the area
 * since the last message, and applies what the scripts did: blocks set, particles, sounds,
 * messages, items given and data stores. Every line goes to the "What happened" trace by the
 * script's id.
 *
 * Messages go one at a time in order. A cancellable event the simulation must wait for
 * (`block.interact`, `block.break`, `block.place`, `entity.interact`, `item.use`,
 * `world.explosion`) is {@link ScriptBridge.ask}ed with a continuation: the simulation holds that
 * click until the scripts answer (at once in process, a few milliseconds from the worker), then
 * goes on unless a script cancelled it. Other events are {@link ScriptBridge.fire}d and their
 * effects show when the answer comes. A handler over its time budget (the worker's 2,000 ms,
 * ADR 0031 D3) is reported and the scripts start again with the area and data stores as they are
 * (their waiting `msm.schedule` callbacks are dropped).
 *
 * Events the simulation never fires are said out loud once per script ({@link SIM_SCRIPT_EVENTS}).
 *
 * Logic rules (B401): a script Rules generated runs instrumented (`rule-steps.ts`), so what it
 * did comes back with the rule's key. Each such line is named by the rule (`Rule "<name>"`,
 * from {@link ScriptBridgeHost.ruleName}, else its key) and links to the rule card; the rule's
 * own steps ({@link RuleStep}: conditions, chances, loops, waits, an error with the step it was
 * in) are said in words. A tick rule whose "only if" is false is said once, not every tick.
 */
import type { BlockCatalogue } from '../blocks/catalogue.js';
import { updateNeighbours } from '../blocks/neighbours.js';
import { PREVIEW_PLAYER_NAME } from '../commands/parse.js';
import type { EntityWorld } from '../entities/entity-world.js';
import { SimRandom } from '../entities/wander.js';
import { parseBlockState, particleName, type SimInventory, soundName } from '../events/actions.js';
import type { SimTrace, TraceEntry } from '../events/trace.js';
import type { PlayerController } from '../player/controller.js';
import type { BlockPos, SimEffect, SimOrigin, Vec3 } from '../types.js';
import { type SimWorld, stateKey } from '../world/sim-world.js';
import type { ScriptApiDescription } from './api.js';
import type {
  EncodedValue,
  EntityRef,
  MobSnapshot,
  PlayerSnapshot,
  RuleStep,
  ScriptOp,
  ScriptRequest,
  ScriptResponse,
  ScriptStep,
  WorldSync,
  XYZ,
} from './protocol.js';
import type { RunnerReply, ScriptRunner } from './runner.js';
import type { CompiledScript, ScriptProblem } from './sources.js';

/** The Script API events the simulation fires (B400); others are said once per script. */
export const SIM_SCRIPT_EVENTS: readonly string[] = Object.freeze([
  'server.started',
  'player.join',
  'server.tick',
  'player.tick',
  'block.interact',
  'block.break',
  'block.place',
  'item.use',
  'entity.interact',
  'entity.death',
  'world.explosion',
  'command',
  'player.chat',
]);

/** Why an event the simulation never fires does not come, in words. */
const NOT_FIRED: Readonly<Record<string, string>> = Object.freeze({
  'entity.hurt': 'mobs have no health in the preview (a hit removes them)',
  'entity.damaged': 'mobs have no health in the preview (a hit removes them)',
  'player.respawn': 'you never die in the preview',
  'player.leave': 'you never leave the preview',
  'player.changeDimension': 'the preview has one dimension',
});

/** What the bridge works on: the local source's parts. */
export interface ScriptBridgeHost {
  readonly world: SimWorld;
  catalogue(): BlockCatalogue;
  readonly player: PlayerController;
  readonly entities: EntityWorld;
  inventory(): SimInventory;
  readonly trace: SimTrace;
  effect(effect: SimEffect): void;
  /** The current tick. */
  now(): number;
  /** An item's display name. */
  itemName(id: string): string;
  /** The item in the player's hand, as the last click had it. */
  heldItem(): string | undefined;
  /** A rule's name in its book, when the rule books are known (B401). */
  ruleName?(book: string, key: string): string | undefined;
  /** How rules' chances are decided now ("Run every time", B401); default `random`. */
  chance?(): 'random' | 'always' | 'never';
}

/** Options of a {@link ScriptBridge}. */
export interface ScriptBridgeOptions {
  readonly runner: ScriptRunner;
  readonly api: ScriptApiDescription;
  /** `msm.version`; default `try-it`. */
  readonly version?: string;
  /** The seed of particle spread; default 1. */
  readonly seed?: number;
}

/** What scripts decided about a cancellable event. */
export interface ScriptDecision {
  readonly cancelled: boolean;
  readonly keepBlocks: boolean;
}

const LET_THROUGH: ScriptDecision = Object.freeze({ cancelled: false, keepBlocks: false });

/** More changed blocks than this go as the whole area. */
const FULL_SYNC_ABOVE = 4096;

interface Pending {
  readonly kind: 'start' | 'request';
  /** What the request runs, for a time-out line ("the block.break handlers"). */
  readonly what?: string;
  readonly request?: (sync: WorldSync) => ScriptRequest;
  readonly then?: (decision: ScriptDecision) => void;
  readonly tick?: boolean;
}

const xyz = (v: Vec3 | BlockPos): XYZ => [v.x, v.y, v.z];

/** Encodes the player for event data. */
export const PLAYER_VALUE: EncodedValue = Object.freeze({ $entity: { kind: 'player' } });

/** Encodes a block for event data. */
export const blockValue = (pos: BlockPos, state: string): EncodedValue => ({
  $block: { pos: xyz(pos), state },
});

/** Encodes a mob for event data. */
export const mobValue = (id: number): EncodedValue => ({ $entity: { kind: 'mob', id } });

/** Encodes a position for event data. */
export const posValue = (pos: Vec3 | BlockPos): EncodedValue => ({ $pos: xyz(pos) });

/** Encodes an item for event data. */
export const itemValue = (id: string, count = 1): EncodedValue => ({ $item: { id, count } });

/** See the module comment. */
export class ScriptBridge {
  private readonly host: ScriptBridgeHost;
  private readonly options: ScriptBridgeOptions;
  private readonly random: SimRandom;
  private scripts: readonly CompiledScript[] = [];
  private books = new Map<string, string>();
  private listenersNow: Readonly<Record<string, readonly string[]>> = {};
  private actionsNow = new Set<string>();
  private nextDue: number | null = null;
  private readonly stores = new Map<string, Map<string, unknown>>();
  private changes = new Map<string, readonly [number, number, number, string]>();
  private needFull = true;
  private readonly queue: Pending[] = [];
  private busy = false;
  private loadedOnce = false;
  private loadedNow = false;
  private readonly said = new Set<string>();
  private disposed = false;
  private readonly unsubscribe: () => void;

  constructor(host: ScriptBridgeHost, options: ScriptBridgeOptions) {
    this.host = host;
    this.options = options;
    this.random = new SimRandom(((options.seed ?? 1) ^ 0x5bd1e995) >>> 0);
    this.unsubscribe = host.world.onChange((change) => {
      if (this.needFull) return;
      const { x, y, z } = change.pos;
      this.changes.set(`${x},${y},${z}`, [
        x,
        y,
        z,
        change.state === null ? '' : stateKey(change.state),
      ]);
      if (this.changes.size > FULL_SYNC_ABOVE) {
        this.needFull = true;
        this.changes.clear();
      }
    });
  }

  /** Whether the scripts have loaded at least once. */
  get loaded(): boolean {
    return this.loadedNow;
  }

  /** The scripts listening for each event, as the last answer gave them. */
  get listeners(): Readonly<Record<string, readonly string[]>> {
    return this.listenersNow;
  }

  /** Whether a script listens for `event`. */
  hears(event: string): boolean {
    return (this.listenersNow[event]?.length ?? 0) > 0;
  }

  /** Whether a script defines the action handler `handler` (`msm.actions.define`). */
  defines(handler: string): boolean {
    return this.actionsNow.has(handler);
  }

  /**
   * Loads (or reloads, after an edit) the scripts: top-level code runs again and handlers are
   * registered afresh, as `/reload` does in the game; data stores stay. The first load also fires
   * `server.started` and then `player.join`.
   */
  load(scripts: readonly CompiledScript[], problems: readonly ScriptProblem[] = []): void {
    this.scripts = scripts;
    this.books = new Map(
      [...scripts, ...problems].flatMap((one) =>
        one.book === undefined ? [] : [[one.id, one.book] as const],
      ),
    );
    for (const problem of problems) {
      this.add(
        problem.id,
        'skipped',
        `The script ${problem.id} has errors, so it does not run in the preview: ${problem.message}`,
      );
    }
    this.enqueue({ kind: 'start' });
  }

  /** Sends `event` to its listeners; their effects show when they answer. */
  fire(event: string, data: Readonly<Record<string, EncodedValue>>): void {
    if (!this.hears(event)) return;
    this.enqueue({
      kind: 'request',
      what: `the ${event} handlers`,
      request: (sync) => ({ type: 'event', name: event, data, sync }),
    });
  }

  /**
   * Asks the listeners of a cancellable `event`; `then` runs with their decision (at once when
   * nobody listens).
   */
  ask(
    event: string,
    data: Readonly<Record<string, EncodedValue>>,
    then: (decision: ScriptDecision) => void,
  ): void {
    if (!this.hears(event)) {
      then(LET_THROUGH);
      return;
    }
    this.enqueue({
      kind: 'request',
      what: `the ${event} handlers`,
      request: (sync) => ({ type: 'event', name: event, data, sync }),
      then,
    });
  }

  /** Runs the action handler `handler` (a `run_script` action); false when no script defines it. */
  runAction(handler: string, data: Readonly<Record<string, EncodedValue>>): boolean {
    if (!this.defines(handler)) return false;
    this.enqueue({
      kind: 'request',
      what: `the action handler ${handler}`,
      request: (sync) => ({ type: 'action', handler, data, sync }),
    });
    return true;
  }

  /** One tick of the area: `server.tick`, `player.tick` and `msm.schedule` callbacks when due. */
  tick(): void {
    const now = this.host.now();
    const due = this.nextDue !== null && now >= this.nextDue;
    if (!due && !this.hears('server.tick') && !this.hears('player.tick')) return;
    // A tick still waiting to go covers this one (the worker is behind the clock).
    if (this.queue.some((one) => one.tick === true)) {
      this.sayOnce(
        'behind',
        'skipped',
        '',
        'The scripts fell behind the clock, so some of their ticks were left out.',
      );
      return;
    }
    this.enqueue({
      kind: 'request',
      what: 'the tick handlers',
      request: (sync) => ({ type: 'tick', sync }),
      tick: true,
    });
  }

  /** The whole area goes with the next message ("Clear the area", a new ground). */
  resync(): void {
    this.needFull = true;
    this.changes.clear();
  }

  /** Stops for good. */
  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    this.queue.length = 0;
    this.options.runner.dispose();
  }

  // The queue.

  private enqueue(item: Pending): void {
    if (this.disposed) return;
    this.queue.push(item);
    this.drain();
  }

  private drain(): void {
    while (!this.busy && !this.disposed) {
      const item = this.queue.shift();
      if (item === undefined) return;
      let reply: RunnerReply;
      try {
        reply =
          item.kind === 'start'
            ? this.options.runner.start(this.init(), this.scripts)
            : this.options.runner.send(
                (item.request as (sync: WorldSync) => ScriptRequest)(this.sync()),
              );
      } catch (error) {
        this.add('', 'skipped', `The scripts could not run in the preview: ${errorWords(error)}`);
        item.then?.(LET_THROUGH);
        continue;
      }
      if (reply instanceof Promise) {
        this.busy = true;
        reply.then(
          (response) => {
            this.busy = false;
            this.answer(item, response);
            this.drain();
          },
          (error: unknown) => {
            this.busy = false;
            if (this.disposed) return;
            this.add(
              '',
              'skipped',
              `The scripts could not run in the preview: ${errorWords(error)}`,
            );
            item.then?.(LET_THROUGH);
            this.drain();
          },
        );
        return;
      }
      this.answer(item, reply);
    }
  }

  private init() {
    const stores: Record<string, Record<string, unknown>> = {};
    for (const [owner, values] of this.stores) stores[owner] = Object.fromEntries(values);
    this.needFull = true;
    return {
      api: this.options.api,
      version: this.options.version ?? 'try-it',
      scripts: this.scripts.map((one) => ({ id: one.id })),
      stores,
      sync: this.sync(),
      seed: this.options.seed ?? 1,
    };
  }

  private sync(): WorldSync {
    const chance = this.host.chance?.() ?? 'random';
    const base = {
      tick: this.host.now(),
      player: this.playerSnapshot(),
      mobs: this.mobSnapshots(),
      ...(chance === 'random' ? {} : { chance }),
    };
    if (this.needFull) {
      this.needFull = false;
      this.changes.clear();
      return { ...base, full: this.snapshot() };
    }
    const changes = [...this.changes.values()];
    this.changes.clear();
    return changes.length === 0 ? base : { ...base, changes };
  }

  private snapshot() {
    const { world } = this.host;
    const palette = ['minecraft:air'];
    const index = new Map<string, number>();
    const cells: number[] = new Array(world.sizeX * world.sizeY * world.sizeZ).fill(0);
    for (const { pos, state } of world.blocks()) {
      const key = stateKey(state);
      let at = index.get(key);
      if (at === undefined) {
        at = palette.length;
        palette.push(key);
        index.set(key, at);
      }
      cells[(pos.y * world.sizeZ + pos.z) * world.sizeX + pos.x] = at;
    }
    return { size: [world.sizeX, world.sizeY, world.sizeZ] as XYZ, palette, cells };
  }

  private playerSnapshot(): PlayerSnapshot {
    const held = this.host.heldItem();
    return {
      name: PREVIEW_PLAYER_NAME,
      pos: xyz(this.host.player.position),
      sneaking: this.host.player.sneaking,
      ...(held === undefined ? {} : { held }),
      items: this.host
        .inventory()
        .slots.flatMap((stack) => (stack === null ? [] : [{ id: stack.id, count: stack.count }])),
    };
  }

  private mobSnapshots(): MobSnapshot[] {
    return this.host.entities.entities().map((mob) => ({
      id: mob.id,
      type: mob.kind.id,
      name: mob.kind.displayName,
      pos: xyz(mob.position),
    }));
  }

  // Answers.

  private answer(item: Pending, response: ScriptResponse): void {
    if (this.disposed) return;
    this.listenersNow = response.listeners;
    this.actionsNow = new Set(response.actions);
    this.nextDue = response.nextDue;
    this.applySteps(response.steps);
    if (response.timedOut !== undefined) {
      this.add(
        '',
        'skipped',
        `${capitalised(item.what ?? 'loading the scripts')} ran for more than ${response.timedOut.ms / 1000} seconds (an endless loop?), so the preview stopped the scripts and started them again; their waiting msm.schedule calls were dropped.`,
      );
      item.then?.(LET_THROUGH);
      this.queue.unshift({ kind: 'start' });
      return;
    }
    if (item.kind === 'start') this.afterLoad();
    item.then?.({ cancelled: response.cancelled, keepBlocks: response.keepBlocks });
  }

  /** After a load: say the events that never come, then the first load's start events. */
  private afterLoad(): void {
    this.loadedNow = true;
    for (const [event, scripts] of Object.entries(this.listenersNow)) {
      if (SIM_SCRIPT_EVENTS.includes(event)) continue;
      for (const script of scripts) {
        const why = NOT_FIRED[event] ?? 'the preview does not fire it yet';
        this.sayOnce(
          `event:${script}:${event}`,
          'onlyInMinecraft',
          script,
          `${event} for the script ${script} (${why})`,
        );
      }
    }
    if (this.loadedOnce) return;
    this.loadedOnce = true;
    this.fire('server.started', {});
    this.fire('player.join', { player: PLAYER_VALUE });
  }

  private applySteps(steps: readonly ScriptStep[]): void {
    const blocks: BlockTally = new Map();
    // A tick rule's start, held until its "only if" says whether it went on (with the lines
    // that came before that check).
    let held: { script: string; rule: string; event: string; kept: ScriptStep[] } | null = null;
    const flush = (): void => {
      if (held === null) return;
      const { script, rule, event, kept } = held;
      held = null;
      this.ruleLine(script, rule, { at: 'start', event });
      for (const one of kept) this.applyStep(one, blocks);
    };
    for (const op of steps) {
      if (held !== null) {
        const same = op.rule === held.rule && 'kind' in op;
        if (same && op.kind === 'rule' && op.step.at === 'check' && op.step.which === 'only') {
          if (!op.step.met) {
            const { script, rule, event, kept } = held;
            held = null;
            for (const one of kept)
              if ('kind' in one && one.kind === 'only') this.applyStep(one, blocks);
            this.sayOnce(
              `only-if:${script}:${rule}`,
              'skipped',
              script,
              `${this.ruleWords(script, rule)} checked its "only if" on ${event}: false, so it stopped. (Said once: it checks again every time.)`,
              rule,
              'check',
            );
            continue;
          }
          flush();
          this.applyStep(op, blocks);
          continue;
        }
        if (same && (op.kind === 'only' || (op.kind === 'rule' && op.step.at === 'chance'))) {
          held.kept.push(op);
          continue;
        }
        flush();
      }
      if (
        'kind' in op &&
        op.kind === 'rule' &&
        op.step.at === 'start' &&
        TICK_EVENTS.includes(op.step.event) &&
        op.rule !== undefined
      ) {
        held = { script: op.script, rule: op.rule, event: op.step.event, kept: [] };
        continue;
      }
      this.applyStep(op, blocks);
    }
    flush();
    for (const one of blocks.values()) {
      const who = this.subject(one.script, one.rule);
      this.add(
        one.script,
        'action',
        one.count === 1
          ? `${who} set ${one.last} at ${one.at.join(', ')}.`
          : `${who} set ${one.count} blocks.`,
        one.rule,
        'did',
      );
    }
  }

  /** Applies one step of an answer; blocks set are tallied in `blocks` and said after. */
  private applyStep(op: ScriptStep, blocks: BlockTally): void {
    if ('kind' in op) {
      if (op.kind === 'rule') this.ruleLine(op.script, op.rule ?? '', op.step);
      else this.applyLine(op);
      return;
    }
    {
      const who = this.subject(op.script ?? '', op.rule);
      switch (op.op) {
        case 'setBlock': {
          const placed = this.setBlock(op.script, op.pos, op.state);
          if (placed === null) break;
          const key = `${op.script}|${op.rule ?? ''}`;
          const one = blocks.get(key) ?? {
            script: op.script,
            ...(op.rule === undefined ? {} : { rule: op.rule }),
            count: 0,
            last: placed,
            at: op.pos,
          };
          blocks.set(key, { ...one, count: one.count + 1, last: placed, at: op.pos });
          break;
        }
        case 'particle':
          this.particles(op, op.rule);
          break;
        case 'sound':
          this.host.effect({
            kind: 'sound',
            id: op.id,
            position: { x: op.pos[0], y: op.pos[1], z: op.pos[2] },
            volume: op.volume,
            pitch: op.pitch,
            origin: this.origin(op.script, op.rule),
          });
          this.add(op.script, 'action', `${who} played sound ${soundName(op.id)}.`, op.rule, 'did');
          break;
        case 'message':
          this.add(op.script, 'action', `${who} says to you: "${op.text}"`, op.rule, 'did');
          this.host.effect({
            kind: 'chip',
            id: op.text,
            target: 'player',
            origin: this.origin(op.script, op.rule),
          });
          break;
        case 'give': {
          const left = this.host.inventory().give(op.item, op.count);
          const name = this.host.itemName(op.item);
          const given = op.count - left;
          this.add(
            op.script,
            'action',
            `${who} gave you ${given} ${name}.${left > 0 ? ` ${left} did not fit in your items.` : ''}`,
            op.rule,
            'did',
          );
          break;
        }
        case 'store': {
          // A rule's counter (ADR 0082 F: `rules.counter.<name>`), said by the rule.
          if (
            op.rule !== undefined &&
            op.script !== undefined &&
            op.key.startsWith(COUNTER_PREFIX) &&
            op.value !== undefined
          ) {
            this.add(
              op.script,
              'action',
              `${who} set its counter ${op.key.slice(COUNTER_PREFIX.length)} to ${JSON.stringify(op.value)}.`,
              op.rule,
              'did',
            );
          }
          let values = this.stores.get(op.owner);
          if (values === undefined) {
            values = new Map();
            this.stores.set(op.owner, values);
          }
          if (op.value === undefined) values.delete(op.key);
          else values.set(op.key, op.value);
          break;
        }
      }
    }
  }

  /** How a line names who did something: the rule (B401), else the script. */
  private subject(script: string, rule: string | undefined): string {
    return rule === undefined ? `The script ${script}` : this.ruleWords(script, rule);
  }

  /** `Rule "<name>"` for a rule of the generated script `script`. */
  private ruleWords(script: string, rule: string): string {
    const book = this.books.get(script);
    const name = book === undefined ? undefined : this.host.ruleName?.(book, rule);
    return `Rule "${name ?? rule}"`;
  }

  /** Says a step of a logic rule (B401) in words. */
  private ruleLine(script: string, rule: string, step: RuleStep): void {
    const name = this.ruleWords(script, rule);
    const say = (kind: TraceEntry['kind'], text: string) =>
      this.add(script, kind, text, rule, step.at);
    switch (step.at) {
      case 'start':
        say('trigger', `The script heard ${step.event}, so rule ${name.slice(5)} ran.`);
        return;
      case 'check':
        if (step.which === 'only') {
          say(
            step.met ? 'action' : 'skipped',
            `${name} checked its "only if": ${step.met ? 'true, so it went on' : 'false, so it stopped'}.`,
          );
        } else {
          say(
            'action',
            `${name} checked its "if": ${
              step.met
                ? 'true, so its "then" steps ran'
                : step.otherwise === true
                  ? 'false, so its "otherwise" steps ran'
                  : 'false, so its "then" steps were left out'
            }.`,
          );
        }
        return;
      case 'chance': {
        const how =
          step.mode === 'always'
            ? ' ("Run every time" is on)'
            : step.mode === 'never'
              ? ' (chances never come up now)'
              : '';
        say(
          'action',
          `${name} rolled its ${step.percent} per cent chance: it ${step.met ? 'came up' : 'did not come up'}${how}.`,
        );
        return;
      }
      case 'repeat':
        say(
          'action',
          step.time <= step.of
            ? `${name} repeats: time ${step.time} of ${step.of}.`
            : `${name} finished repeating (${step.of} ${step.of === 1 ? 'time' : 'times'}).`,
        );
        return;
      case 'each':
        say(
          step.count === 0 ? 'skipped' : 'action',
          step.count === 0
            ? `${name} found no players for its "for each player" steps.`
            : `${name} runs its "for each player" steps for ${step.count} ${step.count === 1 ? 'player' : 'players'}.`,
        );
        return;
      case 'wait':
        say(
          'action',
          `${name} waits ${secondsWords(step.ticks)} (${step.ticks} ${step.ticks === 1 ? 'tick' : 'ticks'} of the preview's clock).`,
        );
        return;
      case 'resume':
        say('action', `${name} waited ${secondsWords(step.ticks)} and goes on.`);
        return;
      case 'gone':
        say('skipped', `${name} stopped after its wait: who started it is gone.`);
        return;
      case 'error':
        say(
          'skipped',
          `${name} failed${step.during === undefined ? '' : ` ${step.during}`}: ${step.message}`,
        );
        return;
    }
  }

  /** Applies a `World.setBlock`; the display name placed, or `null` when nothing changed. */
  private setBlock(script: string, at: XYZ, text: string): string | null {
    const { world } = this.host;
    const pos: BlockPos = { x: at[0], y: at[1], z: at[2] };
    if (!world.inBounds(pos)) return null;
    const catalogue = this.host.catalogue();
    if (text === '') {
      world.set(pos, null);
      updateNeighbours(world, catalogue, pos);
      return 'air';
    }
    const parsed = parseBlockState(text);
    const block = parsed === null ? undefined : catalogue.blockFor(parsed.name);
    const state = parsed === null || block === undefined ? null : catalogue.normalise(parsed);
    if (parsed === null || block === undefined || state === null) {
      this.sayOnce(
        `block:${script}:${parsed?.name ?? text}`,
        'onlyInMinecraft',
        script,
        `${parsed?.name ?? text} (a block of another mod) set by the script ${script}`,
      );
      return null;
    }
    world.set(pos, catalogue.withProperties(state, parsed.properties));
    updateNeighbours(world, catalogue, pos);
    return block.displayName;
  }

  private particles(op: Extract<ScriptOp, { op: 'particle' }>, rule?: string): void {
    const options = typeof op.particle === 'string' ? undefined : op.particle;
    const id = options === undefined ? (op.particle as string) : String(options.type ?? '');
    const gaussian = (): number => {
      const u = Math.max(this.random.next(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.random.next());
    };
    for (let i = 0; i < op.count; i++) {
      this.host.effect({
        kind: 'particle',
        id,
        position: {
          x: op.pos[0] + gaussian() * op.spread,
          y: op.pos[1] + gaussian() * op.spread,
          z: op.pos[2] + gaussian() * op.spread,
        },
        velocity:
          op.motion === undefined
            ? { x: gaussian() * op.speed, y: gaussian() * op.speed, z: gaussian() * op.speed }
            : { x: op.motion[0], y: op.motion[1], z: op.motion[2] },
        ...(options === undefined ? {} : { options }),
        origin: this.origin(op.script, rule),
      });
    }
    this.add(
      op.script,
      'action',
      `${this.subject(op.script, rule)} showed ${op.count} ${particleName(id)} ${op.count === 1 ? 'particle' : 'particles'}.`,
      rule,
      'did',
    );
  }

  private applyLine(line: Exclude<ScriptStep, { kind: 'rule' } | ScriptOp>): void {
    const rule = line.rule;
    switch (line.kind) {
      case 'log': {
        // The generated scripts' own error line ("Rules <book>, rule <key>: ..."), when a rule
        // ran without its steps instrumented.
        const failed = line.level === 'error' ? RULE_ERROR.exec(line.text) : null;
        if (failed !== null && this.books.has(line.script)) {
          const key = failed[2] as string;
          this.add(
            line.script,
            'skipped',
            `${this.ruleWords(line.script, key)} failed: ${failed[3]}`,
            key,
            'error',
          );
          break;
        }
        const what =
          line.level === 'info'
            ? 'logged'
            : line.level === 'warn'
              ? 'logged a warning'
              : 'logged an error';
        this.add(
          line.script,
          'action',
          `${this.subject(line.script, rule)} ${what}: ${line.text}`,
          rule,
          rule === undefined ? undefined : 'did',
        );
        break;
      }
      case 'only':
        this.sayOnce(
          `only:${line.script}:${line.member}${rule === undefined ? '' : `:${rule}`}`,
          'onlyInMinecraft',
          line.script,
          rule === undefined
            ? `${line.member}, used by the script ${line.script}`
            : `${line.member}, used by rule ${this.ruleWords(line.script, rule).slice(5)}`,
          rule,
          rule === undefined ? undefined : 'did',
        );
        break;
      case 'error':
        this.add(
          line.script,
          'skipped',
          line.script === ''
            ? `The scripts could not run: ${line.message}.`
            : rule === undefined
              ? `The script ${line.script} failed in its ${line.where}: ${line.message}`
              : `${this.ruleWords(line.script, rule)} failed in its ${line.where}: ${line.message}`,
          rule,
          rule === undefined ? undefined : 'error',
        );
        break;
    }
  }

  private origin(script: string, rule?: string): SimOrigin {
    if (script === '') return {};
    const book = this.books.get(script);
    if (book === undefined) return { elementId: script };
    return rule === undefined
      ? { elementId: book, ruleBook: book }
      : { elementId: book, ruleKey: rule, ruleBook: book };
  }

  private add(
    script: string,
    kind: TraceEntry['kind'],
    text: string,
    rule?: string,
    ruleStep?: string,
  ): void {
    this.host.trace.add({
      kind,
      text,
      origin: this.origin(script, rule),
      ...(rule === undefined || ruleStep === undefined ? {} : { ruleStep }),
    });
  }

  private sayOnce(
    key: string,
    kind: TraceEntry['kind'],
    script: string,
    text: string,
    rule?: string,
    ruleStep?: string,
  ): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.add(script, kind, text, rule, ruleStep);
  }
}

/** Blocks set by each script (and rule) in one answer. */
type BlockTally = Map<
  string,
  { script: string; rule?: string; count: number; last: string; at: XYZ }
>;

/** The events of a tick: a rule started by one whose "only if" is false is said once (B401). */
const TICK_EVENTS: readonly string[] = ['server.tick', 'player.tick'];

/** The data store key prefix of Rules counters (ADR 0082 findings). */
const COUNTER_PREFIX = 'rules.counter.';

/** The error line of a generated script's `rule` helper (ADR 0082 findings). */
const RULE_ERROR = /^Rules ([a-z0-9_.-]+:[a-z0-9_./-]+), rule ([A-Za-z0-9_.-]+): ([\s\S]*)$/;

/** Ticks as seconds in words ("0.5 seconds", "1 second"). */
function secondsWords(ticks: number): string {
  const value = ticks / 20;
  return `${value} ${value === 1 ? 'second' : 'seconds'}`;
}

/** An entity of the area as event data. */
export const entityValue = (ref: EntityRef): EncodedValue => ({ $entity: ref });

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function errorWords(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
