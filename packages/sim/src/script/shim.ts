/**
 * The Script API shim (B400, ADR 0085 D9 slice 4): the `msm` API of `script-api-v1.json`
 * implemented over a copy of the Try it area, so the project's transpiled scripts run without
 * the game.
 *
 * Every object a script sees is built from the API description: each member the JSON declares on
 * a type (and the types it extends) is either one the shim implements or a stub that writes one
 * "Only in Minecraft" line (once per script and member) and returns a neutral value of its
 * declared type (`undefined`, `0`, `false`, `""`, `[]`, `{}` or a stub object of a declared type).
 * A new member in the JSON therefore can never be silently missing; `test/script/api-walk.test.ts`
 * walks the JSON with {@link ScriptRuntime.probe}.
 *
 * Implemented here: `msm.version`, `msm.log`, `msm.events.on`, `msm.actions.define`,
 * `msm.schedule` (on the area's clock), `msm.storage` and `Entity.data` (in memory),
 * `msm.players`, `msm.getWorld` (this world only), `require` (CommonJS among the same namespace's
 * scripts and `msm:runtime`), `Pos`, `World.dimension`, `time`, `getBlock`, `setBlock`,
 * `spawnParticle`, `playSound`, `entitiesNear`, the identity of entities (`type`, `uuid`, `pos`,
 * `world`, `name`, `isPlayer`, `isAlive`, `asPlayer`), `Player.isSneaking`, `heldItem`, `give`,
 * `hasItem`, `sendMessage`, `BlockRef`, `ItemRef.id` and `count`, the events' own members the
 * bridge sends, `cancel()` and `keepBlocks()`.
 *
 * {@link createScriptRuntime} is **self-contained**: it uses nothing outside its own body (type
 * imports are erased), because the app serialises it with `Function.prototype.toString` into the
 * script worker's `Blob` (as the plugin sandbox's bootstrap is, ADR 0035), where the scripts run
 * without `eval` under the renderer's Content Security Policy. Scripts write into a copy of the
 * area held here; what they do comes back as {@link ScriptOp}s the bridge applies.
 *
 * Rule steps (B401): a script Rules generated is instrumented (`rule-steps.ts`) to call the hooks
 * of the module `msm:try-it` here. While a rule runs, everything it does carries its key; its
 * `msm.schedule` callbacks (its waits) run with the key again; its conditions, chances, loops and
 * waits come back as `rule` lines ({@link RuleStep}), and an error stops only that rule.
 */
import type {
  EncodedValue,
  EntityRef,
  MobSnapshot,
  PlayerSnapshot,
  ProbeResult,
  RuleStep,
  ScriptLine,
  ScriptModuleFn,
  ScriptOp,
  ScriptRequest,
  ScriptResponse,
  ScriptRuntimeInit,
  ScriptStep,
  WorldSync,
  XYZ,
} from './protocol.js';

/** A runtime: handle requests, then collect what they did. */
export interface ScriptRuntime {
  /** Runs one request; its output collects until {@link collect}. */
  handle(request: ScriptRequest): void;
  /** Takes the output collected since the last call. */
  collect(): ScriptResponse;
  /**
   * Tells how a member of the description behaves on a sample object of its type (`msm.log.info`,
   * `World.getBlock`, `require`): `implemented`, `logged` (only in Minecraft) or `missing`.
   */
  probe(path: string): ProbeResult;
}

/**
 * Makes a runtime over `init` with the compiled `modules` by script id. Self-contained: see the
 * module comment.
 */
export function createScriptRuntime(
  init: ScriptRuntimeInit,
  modules: Readonly<Record<string, ScriptModuleFn>>,
): ScriptRuntime {
  type Json = unknown;
  type Obj = Record<string, unknown>;
  type Member =
    | { kind: 'property'; type: string; optional?: boolean }
    | {
        kind: 'method';
        returns?: string;
        overloads?: readonly { returns?: string }[];
      }
    | { kind: 'namespace'; members: Readonly<Record<string, Member>> };
  type Impl = { get: () => unknown } | { call: (...args: unknown[]) => unknown };
  interface Handler {
    script: string;
    fn: (event: unknown) => void;
    interval: number;
  }

  const api = init.api as unknown as {
    types: Readonly<
      Record<string, { extends?: string; members: Readonly<Record<string, Member>> }>
    >;
    globals: Readonly<Record<string, { members: Readonly<Record<string, Member>> }>>;
    events: Readonly<Record<string, { type: string; cancellable: boolean }>>;
    functions?: Readonly<Record<string, Member>>;
    aliases?: Readonly<Record<string, { type: string }>>;
  };
  const AIR = 'minecraft:air';
  const OVERWORLD = 'minecraft:overworld';
  const PLAYER_UUID = '00000000-0000-4000-8000-000000000000';

  // The copy of the area.
  let sizeX = 0;
  let sizeY = 0;
  let sizeZ = 0;
  let palette: string[] = [AIR];
  let paletteIndex = new Map<string, number>([[AIR, 0]]);
  let cells: number[] = [];
  let tick = 0;
  let player: PlayerSnapshot = init.sync.player;
  let mobs = new Map<number, MobSnapshot>();

  // What the current request did.
  /** What scripts did and said, in order. */
  let steps: ScriptStep[] = [];
  let cancelled = false;
  let keepBlocks = false;
  const said = new Set<string>();
  /** The script running now; a Promise callback after its handler counts as the last one's. */
  let current = '';
  let last = '';
  const who = (): string => (current === '' ? last : current);

  const handlers = new Map<string, Handler[]>();
  const actions = new Map<string, { script: string; fn: (event: unknown) => void }>();
  let schedules: {
    due: number;
    seq: number;
    script: string;
    fn: () => void;
    /** The rule that waits (B401), and for how long. */
    rule: string | null;
    ticks: number;
  }[] = [];
  let scheduleSeq = 0;
  const stores = new Map<string, Map<string, Json>>();
  for (const [owner, values] of Object.entries(init.stores)) {
    stores.set(owner, new Map(Object.entries(values)));
  }

  const intern = (state: string): number => {
    let at = paletteIndex.get(state);
    if (at === undefined) {
      at = palette.length;
      palette.push(state);
      paletteIndex.set(state, at);
    }
    return at;
  };
  const cellOf = (x: number, y: number, z: number): number =>
    x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ
      ? -1
      : (y * sizeZ + z) * sizeX + x;

  function applySync(sync: WorldSync): void {
    tick = sync.tick;
    chanceMode = sync.chance ?? 'random';
    player = sync.player;
    mobs = new Map(sync.mobs.map((mob) => [mob.id, mob]));
    if (sync.full !== undefined) {
      [sizeX, sizeY, sizeZ] = sync.full.size;
      palette = [...sync.full.palette];
      paletteIndex = new Map(palette.map((state, index) => [state, index]));
      cells = [...sync.full.cells];
    }
    for (const [x, y, z, state] of sync.changes ?? []) {
      const at = cellOf(x, y, z);
      if (at >= 0) cells[at] = state === '' ? 0 : intern(state);
    }
  }

  // Rule steps (B401): see the module comment.
  /** The key of the rule running now. */
  let ruleNow: string | null = null;
  /** The step the rule running now reached, in words, for an error. */
  let duringNow: string | undefined;
  /** The Script API event being handled (a rule run by `run_script` has none). */
  let eventNow: string | null = null;
  let chanceMode: 'random' | 'always' | 'never' = 'random';
  let chanceSeed = ((init.seed ?? 1) ^ 0x2545f491) >>> 0 || 1;
  /** A seeded number from 0 (inclusive) to 1 (xorshift32). */
  const roll = (): number => {
    chanceSeed ^= chanceSeed << 13;
    chanceSeed >>>= 0;
    chanceSeed ^= chanceSeed >>> 17;
    chanceSeed ^= chanceSeed << 5;
    chanceSeed >>>= 0;
    return chanceSeed / 4294967296;
  };

  // Lines.
  /** Records a step, with the rule key while a rule runs. */
  const emit = (step: ScriptOp | ScriptLine): void => {
    steps.push(ruleNow === null ? step : { ...step, rule: ruleNow });
  };
  const ruleStep = (step: RuleStep): void => {
    if (ruleNow !== null) emit({ kind: 'rule', script: who(), step });
  };
  /** Runs `run` as the rule `key` at the step `during`. */
  function inRule<T>(key: string | null, during: string | undefined, run: () => T): T {
    const beforeRule = ruleNow;
    const beforeDuring = duringNow;
    ruleNow = key;
    duringNow = during;
    try {
      return run();
    } finally {
      ruleNow = beforeRule;
      duringNow = beforeDuring;
    }
  }
  const only = (member: string): void => {
    const script = who();
    const key = `${script}|${member}${ruleNow === null ? '' : `|${ruleNow}`}`;
    if (said.has(key)) return;
    said.add(key);
    emit({ kind: 'only', script, member });
  };
  const errorText = (error: unknown): string => {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  };
  const fail = (script: string, where: string, error: unknown): void => {
    emit({ kind: 'error', script, where, message: errorText(error) });
  };
  /** Says the rule running now stopped with `error`. */
  const ruleFailed = (error: unknown): void => {
    ruleStep({
      at: 'error',
      message: errorText(error),
      ...(duringNow === undefined ? {} : { during: duringNow }),
    });
  };
  const seconds = (ticks: number): string => {
    const value = ticks / 20;
    return `${value} ${value === 1 ? 'second' : 'seconds'}`;
  };
  /** The hooks of `msm:try-it` (B401). */
  const tryIt = {
    rule(key: unknown, body: unknown): void {
      if (typeof body !== 'function') return;
      inRule(String(key), undefined, () => {
        if (eventNow !== null) ruleStep({ at: 'start', event: eventNow });
        try {
          (body as () => void)();
        } catch (error) {
          ruleFailed(error);
        }
      });
    },
    check(which: unknown, value: unknown, otherwise?: unknown): boolean {
      const met = Boolean(value);
      const kind = which === 'only' ? 'only' : 'if';
      ruleStep(
        kind === 'if'
          ? { at: 'check', which: kind, met, otherwise: otherwise === true }
          : { at: 'check', which: kind, met },
      );
      duringNow = kind === 'if' ? 'after its "if" check' : 'after its "only if" check';
      return met;
    },
    chance(percent: unknown): boolean {
      const p = num(percent, 0);
      const met =
        chanceMode === 'always' ? true : chanceMode === 'never' ? false : roll() * 100 < p;
      ruleStep({ at: 'chance', percent: p, met, mode: chanceMode });
      return met;
    },
    repeat(count: unknown, times: unknown): boolean {
      const c = num(count, 0);
      const n = num(times, 0);
      const going = c < n;
      ruleStep({ at: 'repeat', time: c + 1, of: n });
      duringNow = going ? `in time ${c + 1} of its repeat` : 'after its repeat';
      return going;
    },
    each<T>(list: T): T {
      ruleStep({ at: 'each', count: Array.isArray(list) ? list.length : 0 });
      duringNow = 'after starting its "for each player"';
      return list;
    },
    gone(value: unknown): boolean {
      const isGone = Boolean(value);
      if (isGone) ruleStep({ at: 'gone' });
      return isGone;
    },
  };

  // Types from the description.
  const memberCache = new Map<string, [string, Member, string][]>();
  /** The members of a type and the types it extends: name, member, declaring type. */
  function membersOf(typeName: string): [string, Member, string][] {
    const cached = memberCache.get(typeName);
    if (cached !== undefined) return cached;
    const out: [string, Member, string][] = [];
    const seen = new Set<string>();
    let name: string | undefined = typeName;
    while (name !== undefined) {
      const type: { extends?: string; members: Readonly<Record<string, Member>> } | undefined =
        api.types[name];
      if (type === undefined) break;
      for (const [member, value] of Object.entries(type.members)) {
        if (seen.has(member)) continue;
        seen.add(member);
        out.push([member, value, name]);
      }
      name = type.extends;
    }
    memberCache.set(typeName, out);
    return out;
  }

  const returnsOf = (member: Member): string | undefined =>
    member.kind === 'property'
      ? `${member.type}${member.optional === true ? ' | undefined' : ''}`
      : member.kind === 'method'
        ? (member.returns ?? member.overloads?.[0]?.returns)
        : undefined;

  /** A neutral value of a declared type string. */
  function neutral(type: string | undefined, depth = 0): unknown {
    if (type === undefined) return undefined;
    const text = type.trim();
    if (text === '' || text === 'void' || text === 'unknown' || text === 'any') return undefined;
    if (/(^|\|)\s*undefined\s*($|\|)/.test(text)) return undefined;
    if (text.endsWith('[]')) return [];
    if (text === 'boolean') return false;
    if (text === 'number') return 0;
    if (text === 'string') return '';
    if (text.startsWith('Record<') || text.startsWith('{')) return {};
    const literal = /^"([^"]*)"/.exec(text);
    if (literal !== null) return literal[1];
    if (api.types[text] !== undefined) return depth > 4 ? undefined : stubOf(text, depth + 1);
    const alias = api.aliases?.[text];
    if (alias !== undefined && depth < 4) return neutral(alias.type, depth + 1);
    return undefined;
  }

  /**
   * An object of a declared type: `impl`'s members where given, every other declared member a
   * stub that says it is only in Minecraft. Members are not enumerable (they are getters).
   */
  function build(typeName: string, impl: Readonly<Record<string, Impl>>, depth = 0): Obj {
    const object: Obj = {};
    for (const [name, member, declaring] of membersOf(typeName)) {
      const given = impl[name];
      if (given !== undefined) {
        if ('get' in given) Object.defineProperty(object, name, { get: given.get });
        else Object.defineProperty(object, name, { value: given.call, writable: false });
        continue;
      }
      const words = `${declaring}.${name}`;
      if (member.kind === 'method') {
        const value = function stub(): unknown {
          only(words);
          return neutral(returnsOf(member), depth);
        };
        Object.defineProperty(object, name, { value: value, writable: false });
      } else {
        Object.defineProperty(object, name, {
          get: () => {
            only(words);
            return neutral(returnsOf(member), depth);
          },
        });
      }
    }
    return object;
  }
  const stubOf = (typeName: string, depth = 0): Obj => build(typeName, {}, depth);
  const prop = (get: () => unknown): Impl => ({ get });
  const fn = (call: (...args: unknown[]) => unknown): Impl => ({ call });

  // Values.
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  function xyzOf(value: unknown, what: string): XYZ {
    const pos = value as { x?: unknown; y?: unknown; z?: unknown } | null | undefined;
    if (
      pos === null ||
      typeof pos !== 'object' ||
      typeof pos.x !== 'number' ||
      typeof pos.y !== 'number' ||
      typeof pos.z !== 'number'
    ) {
      throw new TypeError(`${what}: expected a position with x, y and z`);
    }
    return [pos.x, pos.y, pos.z];
  }
  const blockOf = (xyz: XYZ): XYZ => [Math.floor(xyz[0]), Math.floor(xyz[1]), Math.floor(xyz[2])];

  function posObj(x: number, y: number, z: number): Obj {
    return build('Pos', {
      x: prop(() => x),
      y: prop(() => y),
      z: prop(() => z),
      offset: fn((dx, dy, dz) => posObj(x + num(dx, 0), y + num(dy, 0), z + num(dz, 0))),
      toString: fn(() => `${x}, ${y}, ${z}`),
    });
  }
  const posFrom = (xyz: XYZ): Obj => posObj(xyz[0], xyz[1], xyz[2]);

  function stateAt(xyz: XYZ): string {
    const at = cellOf(xyz[0], xyz[1], xyz[2]);
    return at < 0 ? AIR : (palette[cells[at] ?? 0] ?? AIR);
  }
  const STATE =
    /^([a-z0-9_.-]+:)?[a-z0-9_./-]+(\[[a-z0-9_]+=[a-z0-9_]+(,[a-z0-9_]+=[a-z0-9_]+)*\])?$/;

  function blockRefObj(xyz: XYZ, state: string): Obj {
    const bracket = state.indexOf('[');
    const id = bracket < 0 ? state : state.slice(0, bracket);
    return build('BlockRef', {
      id: prop(() => id),
      state: prop(() => state),
      pos: prop(() => posFrom(xyz)),
    });
  }

  function itemRefObj(id: string, count: number): Obj {
    return build('ItemRef', { id: prop(() => id), count: prop(() => count) });
  }

  function storeObj(owner: string): Obj {
    const values = (): Map<string, Json> => {
      let found = stores.get(owner);
      if (found === undefined) {
        found = new Map();
        stores.set(owner, found);
      }
      return found;
    };
    const key = (value: unknown): string => {
      if (typeof value !== 'string' || value === '' || value.length > 64) {
        throw new RangeError('A data store key is a text of 1 to 64 characters');
      }
      return value;
    };
    const copy = (value: unknown): Json =>
      value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    return build('DataStore', {
      get: fn((name) => copy(values().get(key(name)))),
      set: fn((name, value) => {
        const k = key(name);
        if (value === undefined || typeof value === 'function') {
          throw new TypeError('A data store value must be a JSON value');
        }
        const kept = copy(value);
        values().set(k, kept);
        emit({ op: 'store', script: who(), owner, key: k, value: kept });
      }),
      remove: fn((name) => {
        const k = key(name);
        const had = values().delete(k);
        if (had) emit({ op: 'store', script: who(), owner, key: k });
        return had;
      }),
      has: fn((name) => values().has(key(name))),
      keys: fn(() => [...values().keys()]),
    });
  }

  const mobUuid = (id: number): string =>
    `00000000-0000-4000-8000-${id.toString(16).padStart(12, '0')}`;

  function entityObj(ref: EntityRef): Obj {
    if (ref.kind === 'player') return playerObj();
    const snapshot = ref.kind === 'mob' ? mobs.get(ref.id) : ref.mob;
    const id = ref.kind === 'mob' ? ref.id : ref.mob.id;
    const last = snapshot ?? { id, type: 'minecraft:pig', name: 'a mob', pos: [0, 0, 0] as XYZ };
    const self: Obj = build('Entity', {
      type: prop(() => last.type),
      uuid: prop(() => mobUuid(id)),
      pos: prop(() => posFrom(mobs.get(id)?.pos ?? last.pos)),
      world: prop(() => worldObj),
      name: prop(() => mobs.get(id)?.name ?? last.name),
      isPlayer: prop(() => false),
      isAlive: prop(() => ref.kind === 'mob' && mobs.has(id)),
      asPlayer: fn(() => undefined),
      data: prop(() => storeObj(mobUuid(id))),
    });
    return self;
  }

  function playerObj(): Obj {
    const self: Obj = build('Player', {
      type: prop(() => 'minecraft:player'),
      uuid: prop(() => PLAYER_UUID),
      pos: prop(() => posFrom(player.pos)),
      world: prop(() => worldObj),
      name: prop(() => player.name),
      isPlayer: prop(() => true),
      isAlive: prop(() => true),
      asPlayer: fn(() => self),
      data: prop(() => storeObj(PLAYER_UUID)),
      isSneaking: prop(() => player.sneaking),
      heldItem: prop(() => player.held),
      give: fn((item, count) => {
        let id: string;
        let amount: number;
        if (typeof item === 'string') {
          id = item;
          amount = 1;
        } else if (
          item !== null &&
          typeof item === 'object' &&
          typeof (item as Obj).id === 'string'
        ) {
          const spec = item as { id: string; count?: unknown; components?: unknown };
          id = spec.id;
          amount = num(spec.count, 1);
          if (spec.components !== undefined) only('Player.give with item components');
        } else {
          throw new TypeError('Player.give: expected an item id or { id, count?, components? }');
        }
        amount = Math.max(1, Math.floor(num(count, amount)));
        const items = player.items.map((stack) => ({ ...stack }));
        const stack = items.find((one) => one.id === id);
        if (stack !== undefined) stack.count += amount;
        else items.push({ id, count: amount });
        player = { ...player, items };
        emit({ op: 'give', script: who(), item: id, count: amount });
      }),
      hasItem: fn(
        (item) => player.held === item || player.items.some((stack) => stack.id === item),
      ),
      sendMessage: fn((text) => {
        emit({ op: 'message', script: who(), text: String(text) });
      }),
    });
    return self;
  }

  const worldObj: Obj = build('World', {
    dimension: prop(() => OVERWORLD),
    time: prop(() => tick),
    getBlock: fn((pos) => stateAt(blockOf(xyzOf(pos, 'World.getBlock')))),
    setBlock: fn((pos, state) => {
      const at = blockOf(xyzOf(pos, 'World.setBlock'));
      if (typeof state !== 'string' || !STATE.test(state.trim())) return false;
      if (cellOf(at[0], at[1], at[2]) < 0) {
        only('World.setBlock outside the test area');
        return false;
      }
      const text = state.trim().includes(':') ? state.trim() : `minecraft:${state.trim()}`;
      const air = /^minecraft:(air|cave_air|void_air)$/.test(text);
      cells[cellOf(at[0], at[1], at[2])] = air ? 0 : intern(text);
      emit({ op: 'setBlock', script: who(), pos: at, state: air ? '' : text });
      return true;
    }),
    spawnParticle: fn((particle, pos, options) => {
      const at = xyzOf(pos, 'World.spawnParticle');
      const o = (options ?? {}) as {
        count?: unknown;
        spread?: unknown;
        speed?: unknown;
        motion?: unknown;
      };
      let kind: string | Readonly<Record<string, unknown>>;
      if (typeof particle === 'string') kind = particle;
      else if (particle !== null && typeof particle === 'object') {
        kind = JSON.parse(JSON.stringify(particle)) as Readonly<Record<string, unknown>>;
      } else throw new TypeError('World.spawnParticle: expected a particle id or options');
      const motion =
        Array.isArray(o.motion) && o.motion.length === 3
          ? ([num(o.motion[0], 0), num(o.motion[1], 0), num(o.motion[2], 0)] as XYZ)
          : undefined;
      emit({
        op: 'particle',
        script: who(),
        particle: kind,
        pos: at,
        count: Math.min(1000, Math.max(1, Math.floor(num(o.count, 1)))),
        spread: Math.max(0, num(o.spread, 0)),
        speed: Math.max(0, num(o.speed, 0)),
        ...(motion === undefined ? {} : { motion }),
      });
    }),
    playSound: fn((id, pos, options) => {
      const o = (options ?? {}) as { volume?: unknown; pitch?: unknown };
      emit({
        op: 'sound',
        script: who(),
        id: String(id),
        pos: xyzOf(pos, 'World.playSound'),
        volume: num(o.volume, 1),
        pitch: num(o.pitch, 1),
      });
    }),
    entitiesNear: fn((pos, radius) => {
      const at = xyzOf(pos, 'World.entitiesNear');
      const r = num(radius, 0);
      const near = (xyz: XYZ): boolean =>
        Math.hypot(xyz[0] - at[0], xyz[1] - at[1], xyz[2] - at[2]) <= r;
      const out: Obj[] = [];
      if (near(player.pos)) out.push(playerObj());
      for (const mob of mobs.values())
        if (near(mob.pos)) out.push(entityObj({ kind: 'mob', id: mob.id }));
      return out;
    }),
  });

  /** Turns event data into API values (see `protocol.ts`). */
  function decode(value: EncodedValue | undefined): unknown {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) return value.map((one) => decode(one));
    if (typeof value !== 'object') return value;
    const tagged = value as Record<string, unknown>;
    if ('$pos' in tagged) return posFrom(tagged.$pos as XYZ);
    if ('$entity' in tagged) return entityObj(tagged.$entity as EntityRef);
    if ('$block' in tagged) {
      const block = tagged.$block as { pos: XYZ; state: string };
      return blockRefObj(block.pos, block.state);
    }
    if ('$item' in tagged) {
      const item = tagged.$item as { id: string; count: number };
      return itemRefObj(item.id, item.count);
    }
    const out: Obj = {};
    for (const [key, one] of Object.entries(value)) out[key] = decode(one as EncodedValue);
    return out;
  }

  /** An event object of a declared type with the given data; every other member a stub. */
  function eventObj(typeName: string, data: Readonly<Record<string, EncodedValue>>): Obj {
    const impl: Record<string, Impl> = { world: prop(() => worldObj) };
    for (const [key, raw] of Object.entries(data)) {
      const value = decode(raw);
      impl[key] = prop(() => value);
    }
    const declared = new Set(membersOf(typeName).map(([name]) => name));
    if (declared.has('cancel')) {
      impl.cancel = fn(() => {
        cancelled = true;
      });
    }
    if (declared.has('keepBlocks')) {
      impl.keepBlocks = fn(() => {
        keepBlocks = true;
      });
    }
    return build(typeName, impl);
  }

  // The msm object.
  function namespaceObj(
    prefix: string,
    members: Readonly<Record<string, Member>>,
    impls: Readonly<Record<string, Impl>>,
  ): Obj {
    const object: Obj = {};
    for (const [name, member] of Object.entries(members)) {
      const path = `${prefix}${name}`;
      if (member.kind === 'namespace') {
        const inner = namespaceObj(`${path}.`, member.members, impls);
        Object.defineProperty(object, name, { value: inner, enumerable: true });
        continue;
      }
      const given = impls[path];
      if (given !== undefined) {
        if ('get' in given)
          Object.defineProperty(object, name, { get: given.get, enumerable: true });
        else Object.defineProperty(object, name, { value: given.call, enumerable: true });
      } else if (member.kind === 'method') {
        Object.defineProperty(object, name, {
          value: function stub(): unknown {
            only(path);
            return neutral(returnsOf(member));
          },
        });
      } else {
        Object.defineProperty(object, name, {
          get: () => {
            only(path);
            return neutral(returnsOf(member));
          },
        });
      }
    }
    return object;
  }

  const logAt =
    (level: 'info' | 'warn' | 'error') =>
    (message: unknown): void => {
      emit({ kind: 'log', level, script: who(), text: String(message) });
    };
  const worldStore = storeObj('world');
  const msm: Obj = namespaceObj('msm.', api.globals.msm?.members ?? {}, {
    'msm.version': prop(() => init.version),
    'msm.log.info': fn(logAt('info')),
    'msm.log.warn': fn(logAt('warn')),
    'msm.log.error': fn(logAt('error')),
    'msm.events.on': fn((name, handler, options) => {
      if (typeof name !== 'string' || api.events[name] === undefined) {
        emit({
          kind: 'error',
          script: who(),
          where: 'msm.events.on',
          message: `unknown event name ${JSON.stringify(name)}`,
        });
        return;
      }
      if (typeof handler !== 'function')
        throw new TypeError('msm.events.on: the handler must be a function');
      const interval = Math.max(
        1,
        Math.floor(num((options as { interval?: unknown } | undefined)?.interval, 1)),
      );
      const list = handlers.get(name) ?? [];
      list.push({ script: who(), fn: handler as (event: unknown) => void, interval });
      handlers.set(name, list);
    }),
    'msm.actions.define': fn((id, handler) => {
      if (typeof id !== 'string' || id === '')
        throw new TypeError('msm.actions.define: expected a handler id');
      if (typeof handler !== 'function')
        throw new TypeError('msm.actions.define: the handler must be a function');
      actions.set(id, { script: who(), fn: handler as (event: unknown) => void });
    }),
    'msm.schedule': fn((ticks, callback) => {
      if (typeof ticks !== 'number' || !Number.isInteger(ticks) || ticks < 1) {
        throw new RangeError('msm.schedule: ticks must be a whole number of at least 1');
      }
      if (typeof callback !== 'function') throw new TypeError('msm.schedule: expected a function');
      scheduleSeq += 1;
      schedules.push({
        due: tick + ticks,
        seq: scheduleSeq,
        script: who(),
        fn: callback as () => void,
        rule: ruleNow,
        ticks,
      });
      ruleStep({ at: 'wait', ticks, due: tick + ticks });
    }),
    'msm.storage': prop(() => worldStore),
    'msm.players': fn(() => [playerObj()]),
    'msm.getWorld': fn((dimension) => {
      if (dimension === OVERWORLD) return worldObj;
      only('msm.getWorld for other dimensions');
      return undefined;
    }),
  });
  const runtimeModule = { msm };
  const tryItModule = { tryIt };

  // Modules (CommonJS, ADR 0031 D3 and the D1 amendment of ADR 0032).
  const loaded = new Map<string, { exports: unknown }>();
  function resolve(from: string, id: string): string {
    const colon = from.indexOf(':');
    const namespace = from.slice(0, colon);
    const dir = from
      .slice(colon + 1)
      .split('/')
      .slice(0, -1);
    for (const part of id.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') dir.pop();
      else dir.push(part);
    }
    return `${namespace}:${dir.join('/').replace(/\.(js|ts)$/, '')}`;
  }
  function requireFrom(from: string, id: unknown): unknown {
    if (id === 'msm:runtime') return runtimeModule;
    if (id === 'msm:try-it') return tryItModule;
    if (typeof id !== 'string' || !(id.startsWith('./') || id.startsWith('../'))) {
      throw new Error(
        `Cannot find script ${JSON.stringify(id)}: require takes "./..." or "msm:runtime"`,
      );
    }
    return load(resolve(from, id));
  }
  function load(id: string): unknown {
    const done = loaded.get(id);
    if (done !== undefined) return done.exports;
    const body = modules[id];
    if (body === undefined) throw new Error(`Cannot find script "${id}"`);
    const module: { exports: unknown } = { exports: {} };
    loaded.set(id, module);
    const before = current;
    current = id;
    try {
      body(
        module.exports as Record<string, unknown>,
        (other) => requireFrom(id, other),
        module,
        msm,
      );
    } finally {
      current = before;
    }
    return module.exports;
  }

  function dropHandlersOf(script: string): void {
    for (const [name, list] of handlers) {
      handlers.set(
        name,
        list.filter((one) => one.script !== script),
      );
    }
    for (const [id, action] of actions) if (action.script === script) actions.delete(id);
  }

  function call(script: string, where: string, run: () => void): void {
    const before = current;
    current = script;
    last = script;
    try {
      run();
    } catch (error) {
      fail(script, where, error);
    } finally {
      current = before;
    }
  }

  function fireEvent(name: string, data: Readonly<Record<string, EncodedValue>>): void {
    const list = handlers.get(name) ?? [];
    if (list.length === 0) return;
    const type = api.events[name]?.type ?? 'GameEvent';
    const event = eventObj(type, data);
    const before = eventNow;
    eventNow = name;
    try {
      for (const handler of [...list]) {
        call(handler.script, `${name} handler`, () => handler.fn(event));
      }
    } finally {
      eventNow = before;
    }
  }

  function runTick(): void {
    const tickers = handlers.get('server.tick') ?? [];
    if (tickers.length > 0) fireEvent('server.tick', { tick });
    const players = (handlers.get('player.tick') ?? []).filter((one) => tick % one.interval === 0);
    if (players.length > 0) {
      const event = eventObj(api.events['player.tick']?.type ?? 'GameEvent', {
        player: { $entity: { kind: 'player' } },
      });
      eventNow = 'player.tick';
      try {
        for (const handler of players)
          call(handler.script, 'player.tick handler', () => handler.fn(event));
      } finally {
        eventNow = null;
      }
    }
    const due = schedules
      .filter((one) => one.due <= tick)
      .sort((a, b) => a.due - b.due || a.seq - b.seq);
    if (due.length === 0) return;
    schedules = schedules.filter((one) => one.due > tick);
    for (const one of due) {
      if (one.rule === null) {
        call(one.script, 'msm.schedule callback', one.fn);
        continue;
      }
      // A rule's wait ended (B401): the rule goes on, by its key.
      const rule = one.rule;
      call(one.script, 'msm.schedule callback', () =>
        inRule(rule, `after its wait of ${seconds(one.ticks)}`, () => {
          ruleStep({ at: 'resume', ticks: one.ticks });
          try {
            one.fn();
          } catch (error) {
            ruleFailed(error);
          }
        }),
      );
    }
  }

  function handle(request: ScriptRequest): void {
    if (request.type === 'load') {
      for (const script of init.scripts) {
        if (loaded.has(script.id)) continue;
        try {
          load(script.id);
        } catch (error) {
          dropHandlersOf(script.id);
          fail(script.id, 'loading', error);
        }
      }
      return;
    }
    applySync(request.sync);
    if (request.type === 'event') {
      fireEvent(request.name, request.data);
    } else if (request.type === 'action') {
      const action = actions.get(request.handler);
      if (action === undefined) {
        emit({
          kind: 'error',
          script: '',
          where: 'run_script',
          message: `no script defines the action handler ${request.handler}`,
        });
        return;
      }
      const event = eventObj('ActionEvent', request.data);
      call(action.script, `action handler ${request.handler}`, () => action.fn(event));
    } else {
      runTick();
    }
  }

  function collect(): ScriptResponse {
    const listeners: Record<string, string[]> = {};
    for (const [name, list] of handlers) {
      if (list.length > 0) listeners[name] = [...new Set(list.map((one) => one.script))];
    }
    const next = schedules.reduce<number | null>(
      (soonest, one) => (soonest === null || one.due < soonest ? one.due : soonest),
      null,
    );
    const response: ScriptResponse = {
      steps,
      cancelled,
      keepBlocks,
      listeners,
      actions: [...actions.keys()],
      nextDue: next,
    };
    steps = [];
    cancelled = false;
    keepBlocks = false;
    return response;
  }

  function sampleOf(typeName: string): Obj {
    switch (typeName) {
      case 'Pos':
        return posObj(0, 0, 0);
      case 'World':
        return worldObj;
      case 'Player':
        return playerObj();
      case 'Entity': {
        const first = mobs.values().next().value as MobSnapshot | undefined;
        return first === undefined ? playerObj() : entityObj({ kind: 'mob', id: first.id });
      }
      case 'BlockRef':
        return blockRefObj([0, 0, 0], AIR);
      case 'ItemRef':
        return itemRefObj(AIR, 1);
      case 'DataStore':
        return storeObj('probe');
      default: {
        const isEvent = Object.values(api.events).some((event) => event.type === typeName);
        return isEvent || typeName === 'ActionEvent' || typeName === 'GameEvent'
          ? eventObj(typeName, {})
          : stubOf(typeName);
      }
    }
  }

  function probe(path: string): ProbeResult {
    const stepsBefore = steps.length;
    const before = current;
    current = `probe:${path}`;
    try {
      let target: Obj | undefined;
      let member: string;
      if (api.functions?.[path] !== undefined) {
        return path === 'require' ? 'implemented' : 'logged';
      }
      const parts = path.split('.');
      member = parts.pop() as string;
      if (api.globals[parts[0] as string] !== undefined) {
        let object: unknown = parts[0] === 'msm' ? msm : undefined;
        for (const part of parts.slice(1)) object = (object as Obj | undefined)?.[part];
        target = object as Obj | undefined;
      } else {
        target = sampleOf(parts.join('.'));
      }
      if (target === undefined || !(member in target)) return 'missing';
      try {
        const value = (target as Obj)[member];
        if (typeof value === 'function' && membersOrGlobal(path) === 'method') {
          (value as (...args: unknown[]) => unknown).call(target);
        }
      } catch {
        // An implemented member may refuse probe arguments; that is still implemented.
      }
      return steps.slice(stepsBefore).some((step) => 'kind' in step && step.kind === 'only')
        ? 'logged'
        : 'implemented';
    } finally {
      steps.length = stepsBefore;
      current = before;
    }
  }

  function membersOrGlobal(path: string): 'method' | 'property' {
    const parts = path.split('.');
    const name = parts.pop() as string;
    if (api.globals[parts[0] as string] !== undefined) {
      let members: Readonly<Record<string, Member>> | undefined =
        api.globals[parts[0] as string]?.members;
      for (const part of parts.slice(1)) {
        const next: Member | undefined = members?.[part];
        members = next?.kind === 'namespace' ? next.members : undefined;
      }
      return members?.[name]?.kind === 'method' ? 'method' : 'property';
    }
    const found = membersOf(parts.join('.')).find(([one]) => one === name);
    return found?.[1].kind === 'method' ? 'method' : 'property';
  }

  applySync(init.sync);
  return { handle, collect, probe };
}
