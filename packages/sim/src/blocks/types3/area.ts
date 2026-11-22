/**
 * Vanilla parity 3, batch 1 in one Try it area (B519, ADR 0112 D5): what `LocalWorldSource` hands
 * to this part of the simulation, so its own file only calls it. It owns
 *
 * - the uses of the five types of ADR 0103 ({@link useType3}): pots taking and giving plants,
 *   berries picked;
 * - big dripleaves tilting under whoever stands on them (`tilt_ticks`, then 100 ticks of full
 *   tilt);
 * - the block's own sounds (`block_sounds`, an own set type's sounds) as captions, the way the
 *   game's subtitles show them (ADR 0105 D1, D2);
 * - double chests and per-player chests: the screen of both halves (54 slots) and the lines on
 *   what only the game does (ADR 0104 D4, D5);
 * - once per block, what only the game does: soils, water, light, random-tick growth, touch
 *   damage.
 *
 * Block transformers and vanilla block rules on blocks (B614) are `../vanilla-rules.ts`'s
 * {@link VanillaBlockRules}, asked first on every use; its exports are re-exported here.
 */
import type { WorldBox } from '../../player/collide.js';
import type { BlockPos, BlockState, SimEffect, SimFiles, SimLog, SimOrigin } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import { updateNeighbours } from '../neighbours.js';
import { VanillaBlockRules } from '../vanilla-rules.js';
import { light3Of } from './facts.js';
import { useType3 } from './use.js';

/** What the area part works with. */
export interface Types3Host {
  readonly world: SimWorld;
  readonly catalogue: () => BlockCatalogue;
  readonly log: SimLog;
  /** Says a line once per key for the area's life. */
  readonly sayOnce: (key: string, what: string, origin?: SimOrigin) => void;
  /** Shows an effect (a sound's caption). */
  readonly effect: (effect: SimEffect) => void;
  /** Puts items in the player's hands (the test inventory). */
  readonly give: (id: string, count: number) => void;
  /** The boxes of everyone who can stand on a block: the player and the mobs. */
  readonly standing: () => readonly WorldBox[];
  /** The current tick. */
  readonly now: () => number;
}

/** What a use meant for the caller. */
export interface Types3UseOutcome {
  /** True when the block took the click (the caller stops, after `msm:on_interact`). */
  readonly taken: boolean;
}

/** A big dripleaf on its way through its tilts. */
interface Tilting {
  readonly pos: BlockPos;
  readonly block: string;
  /** The tick of its next tilt. */
  due: number;
}

/** The tilts of a big dripleaf in order, back to none at the end. */
const TILTS = ['none', 'unstable', 'partial', 'full'] as const;

export * from '../vanilla-rules.js';

const posKey = (pos: BlockPos): string => `${pos.x},${pos.y},${pos.z}`;

/** See the module comment. */
export class Types3Area {
  private readonly host: Types3Host;
  private readonly tilting = new Map<string, Tilting>();
  private readonly rules: VanillaBlockRules;

  constructor(files: SimFiles, host: Types3Host) {
    this.host = host;
    this.rules = new VanillaBlockRules(host);
    this.setFiles(files);
  }

  /** New lowered files (a live edit). */
  setFiles(files: SimFiles): void {
    this.rules.setFiles(files);
    for (const [key, one] of [...this.tilting]) {
      if (this.host.world.get(one.pos)?.name !== one.block) this.tilting.delete(key);
    }
  }

  /** "Clear the area": every tilt stops. */
  clear(): void {
    this.tilting.clear();
  }

  /**
   * A right click on a block (before vanilla parity 2's uses and `msm:on_interact`): a tool on a
   * block a rule or transformer changes (B614), a pot, a potted plant in a project pot or a
   * strand with berries.
   */
  use(pos: BlockPos, state: BlockState, block: CatalogueBlock, item?: string): Types3UseOutcome {
    if (this.rules.use(pos, state, block, item)) return { taken: true };
    const catalogue = this.host.catalogue();
    if (block.types3 === undefined && catalogue.pottedIn(block.id) === undefined) {
      return { taken: false };
    }
    const result = useType3(this.host.world, catalogue, block, state, pos, item);
    if (!result.handled) return { taken: false };
    for (const change of result.changes) updateNeighbours(this.host.world, catalogue, change.pos);
    if (result.message !== undefined) this.host.log.info(result.message, block.origin);
    if (result.onlyInMinecraft !== undefined) {
      this.host.sayOnce(`use3:${block.id}`, result.onlyInMinecraft, block.origin);
    }
    if (result.give !== undefined) this.host.give(result.give.id, result.give.count);
    return { taken: true };
  }

  /** A block was placed at `pos`: its place sound and the lines on what only the game does. */
  placed(pos: BlockPos): void {
    const state = this.host.world.get(pos);
    if (state === null) return;
    const block = this.host.catalogue().blockFor(state.name);
    if (block === undefined) return;
    this.sound(block, 'place', pos);
    this.sayLines(block, state);
  }

  /** The player is about to break the block at `pos`: its break sound. */
  breaking(pos: BlockPos): void {
    const state = this.host.world.get(pos);
    const block = state === null ? undefined : this.host.catalogue().blockFor(state.name);
    if (block === undefined) return;
    this.sound(block, 'break', pos);
    if (block.types3?.companion?.kind === 'potted' || this.host.catalogue().pottedIn(block.id)) {
      this.host.sayOnce(
        `potted-drops:${block.id}`,
        `breaking ${block.displayName} drops the pot and the plant (the preview gives no drops)`,
        block.origin,
      );
    }
    if (block.storage?.double === true && state?.properties.type !== 'single') {
      this.host.sayOnce(
        `double-drops:${block.id}`,
        `a broken half of ${block.displayName} drops its own 27 slots; the other half stays a single chest`,
        block.origin,
      );
    }
  }

  /**
   * A door, trapdoor, gate or button was used: an own set type's open, close or press sound (ADR
   * 0105 D2).
   */
  usedByHand(pos: BlockPos, before: BlockState | null): void {
    const after = this.host.world.get(pos);
    if (before === null || after === null) return;
    const block = this.host.catalogue().blockFor(after.name);
    const sounds = block?.setTypeSounds;
    if (block === undefined || sounds === undefined) return;
    let event: string | undefined;
    if (before.properties.open !== after.properties.open) {
      event = after.properties.open === 'true' ? 'open' : 'close';
    } else if (before.properties.powered !== after.properties.powered) {
      event = after.properties.powered === 'true' ? 'press' : 'release';
    }
    const id = event === undefined ? undefined : sounds[event];
    if (id === undefined) return;
    this.host.effect({
      kind: 'sound',
      id,
      position: { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
      origin: block.origin,
    });
  }

  /**
   * A container screen opens on a block: a double chest's halves show both halves' 54 slots; a
   * per-player chest says it shows the one player's store.
   */
  screenRows(state: BlockState, rows: number): number {
    const block = this.host.catalogue().blockFor(state.name);
    if (block?.storage === undefined) return rows;
    if (block.storage.perPlayer) {
      this.host.sayOnce(
        `per-player:${block.id}`,
        `${block.displayName} keeps a store for each player (one store for every block of its family); the preview has one player, so it shows that one store`,
        block.origin,
      );
    }
    if (
      block.storage.double &&
      state.properties.type !== 'single' &&
      state.properties.type !== undefined
    ) {
      this.host.log.info(
        `Both halves of ${block.displayName} open as one screen of 54 slots.`,
        block.origin,
      );
      return rows * 2;
    }
    return rows;
  }

  /** One tick: big dripleaves tilt under whoever stands on them. */
  tick(): void {
    const world = this.host.world;
    const catalogue = this.host.catalogue();
    const now = this.host.now();
    for (const box of this.host.standing()) {
      // The leaf's top is a pixel or more under a standing entity's feet.
      const pos = {
        x: Math.floor((box[0] + box[3]) / 2),
        y: Math.floor(box[1] - 0.05),
        z: Math.floor((box[2] + box[5]) / 2),
      };
      const state = world.get(pos);
      if (state === null || state.properties.tilt !== 'none') continue;
      const block = catalogue.blockFor(state.name);
      const dripleaf = block?.types3?.dripleaf;
      if (dripleaf?.size !== 'big' || block?.types3?.companion !== undefined) continue;
      if (box[1] < pos.y + 11 / 16) continue;
      const key = posKey(pos);
      if (!this.tilting.has(key)) {
        this.tilting.set(key, { pos, block: state.name, due: now + dripleaf.tiltTicks[0] });
      }
    }
    for (const [key, one] of [...this.tilting]) {
      if (now < one.due) continue;
      const state = world.get(one.pos);
      const block = state === null ? undefined : catalogue.blockFor(state.name);
      const ticks = block?.types3?.dripleaf?.tiltTicks;
      if (state === null || state.name !== one.block || ticks === undefined) {
        this.tilting.delete(key);
        continue;
      }
      const at = TILTS.indexOf((state.properties.tilt ?? 'none') as (typeof TILTS)[number]);
      const next = at >= TILTS.length - 1 ? 'none' : (TILTS[at + 1] as string);
      world.set(one.pos, catalogue.withProperties(state, { tilt: next }));
      if (next === 'none') {
        this.tilting.delete(key);
      } else {
        one.due = now + (next === 'unstable' ? ticks[1] : next === 'partial' ? ticks[2] : 100);
      }
    }
  }

  private sound(block: CatalogueBlock, event: 'place' | 'break' | 'step', pos: BlockPos): void {
    const sounds = block.sounds;
    const id = sounds?.events[event];
    if (sounds === undefined || id === undefined) return;
    this.host.effect({
      kind: 'sound',
      id,
      position: { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
      ...(sounds.volume === undefined ? {} : { volume: sounds.volume }),
      ...(sounds.pitch === undefined ? {} : { pitch: sounds.pitch }),
      origin: block.origin,
    });
    this.host.sayOnce(
      `sounds:${block.id}`,
      `${block.displayName}'s own step, mining and landing sounds (the preview shows its place and break sounds as captions)`,
      block.origin,
    );
  }

  private sayLines(block: CatalogueBlock, state: BlockState): void {
    const facts = block.types3;
    const say = (key: string, what: string): void =>
      this.host.sayOnce(`${key}:${block.id}`, what, block.origin);
    if (facts === undefined) return;
    const name = block.displayName;
    const light = light3Of(facts, state.properties);
    if (facts.multiface !== undefined || facts.growing?.berries !== undefined) {
      say(
        'light3',
        `the light ${name} gives (level ${facts.multiface?.light ?? facts.growing?.berries?.light ?? light}${facts.growing?.berries !== undefined ? ' with berries' : ''}); the preview draws no light`,
      );
    }
    if (facts.growing !== undefined) {
      say(
        'grow3',
        `${name} growing by itself on random ticks (chance ${facts.growing.growthChance} a tick, at most 26 blocks from age 0; use Grow to see one bone meal)`,
      );
      if (facts.growing.soil !== undefined)
        say(
          'soil3',
          `${name} stands only on its soil (${facts.growing.soil.join(', ')}); the preview plants it on anything`,
        );
      if (facts.growing.needsWater)
        say(
          'water3',
          `${name} lives in water: in the game it is placed only in water and breaks when the water goes; the preview places it anywhere`,
        );
    }
    if (facts.column !== undefined) {
      const column = facts.column;
      say(
        'grow3',
        column.style === 'bamboo'
          ? `${name} growing by itself (one time in three at light 9 or more, stopping between ${column.minHeight} and ${column.maxHeight} blocks); use Grow to see one bone meal`
          : `${name} growing by itself (one block every 16 random ticks, stopping between ${column.minHeight} and ${column.maxHeight} blocks); use Grow to see it`,
      );
      say(
        'soil3',
        `${name} stands only on its soil${column.needsWaterNearby ? ' with water beside it' : ''}; the preview plants it on anything`,
      );
      if (column.touchDamage > 0)
        say(
          'hurt3',
          `${name} hurts whoever touches it (${column.touchDamage} damage); the preview has no health`,
        );
    }
    if (facts.dripleaf?.size === 'big' && facts.companion === undefined) {
      say(
        'tilt3',
        `${name} tilts when you stand on it and drops you when fully tilted; a redstone signal resets it (the preview tilts it, without redstone)`,
      );
    }
    if (facts.pot !== undefined && facts.companion === undefined) {
      const count = Object.keys(facts.pot.plants).length;
      say(
        'pot3',
        `${name} takes only the ${count} plant${count === 1 ? '' : 's'} it lists; use it with one of them in hand`,
      );
    }
  }
}
