/**
 * Vanilla parity 2 in one Try it area (B463, ADR 0101 D5): what `LocalWorldSource` hands to this
 * part of the simulation, so its own file only registers it. It owns
 *
 * - the sign text ({@link SignBoard}) and the sign being edited (the view's editor mock-up);
 * - weathering ({@link WeatheringField}): ageing on the clock's random ticks and the time-lapse;
 * - the place, explosion and command events of scripts and Rules ({@link WorldEvents});
 * - the chat box ({@link CommandRunner});
 * - bags and bundles in the hand ({@link bagsFromFiles}) and the bag screen open now;
 * - the uses of the twenty types ({@link useType2}) and what they only do in the game.
 */

import type { CommandsTarget } from '../../commands/catalogue.js';
import { type ChatLine, CommandRunner } from '../../commands/run.js';
import { SimRandom } from '../../entities/wander.js';
import { type EventContext, PLAYER } from '../../events/actions.js';
import type { SimTrace } from '../../events/trace.js';
import type { TriggerEngine } from '../../events/triggers.js';
import {
  type BagScreen,
  bagScreenWords,
  bagsFromFiles,
  type ItemInventorySpec,
} from '../../items/bags.js';
import type { PlayerController } from '../../player/controller.js';
import type { BlockPos, BlockState, SimFiles, SimLog, SimOrigin } from '../../types.js';
import type { SimWorld } from '../../world/sim-world.js';
import type { BlockCatalogue, CatalogueBlock } from '../catalogue.js';
import { type BlockChange, updateNeighbours } from '../neighbours.js';
import { type AgeingResult, TIME_LAPSE_TICKS, WeatheringField } from '../weathering.js';
import { CLIMBABLE_TYPES_2, isType2, lightOf } from './facts.js';
import { SignBoard, type SignEdit, type SignText, signWords } from './signs.js';
import { EXPLOSION_RADIUS, explosionReach } from './tools.js';
import { type SignSide, useType2 } from './use.js';
import type { RuleNamer } from './world-events.js';
import { WorldEvents } from './world-events.js';

/** A sign the player is writing on (the view's editor). */
export interface SignEditing {
  readonly pos: BlockPos;
  readonly side: SignSide;
  readonly block: string;
  readonly displayName: string;
  readonly hanging: boolean;
  readonly origin: SimOrigin;
}

/** A bag the player has open (the view's mock-up screen). */
export interface OpenBag {
  readonly item: string;
  readonly displayName: string;
  readonly spec: BagScreen;
  readonly origin: SimOrigin;
}

/** What the area part works with. */
export interface Types2Host {
  readonly world: SimWorld;
  readonly catalogue: () => BlockCatalogue;
  readonly player: PlayerController;
  readonly triggers: () => TriggerEngine;
  readonly trace: SimTrace;
  readonly log: SimLog;
  /** Says a line once per key for the area's life. */
  readonly sayOnce: (key: string, what: string, origin?: SimOrigin) => void;
  /** A block screen or another mock-up is open: close it first. */
  readonly closeOtherScreens: () => void;
  readonly seed: number;
  readonly ruleName: RuleNamer;
}

/** The trigger spec ids fired here. */
const ON_EAT = 'block:on_eat';
const BAG_OPEN = 'item:msm:item_inventory.on_open';
const BAG_CLOSE = 'item:msm:item_inventory.on_close';

/** What a use of one of the twenty types meant for the caller. */
export interface Types2UseOutcome {
  /** True when the block took the click (the caller stops, after `msm:on_interact`). */
  readonly taken: boolean;
}

/** See the module comment. */
export class Types2Area {
  /** The text of every sign. */
  readonly signs = new SignBoard();
  /** Weathering blocks and their ageing. */
  readonly weathering: WeatheringField;
  /** The place, explosion and command events. */
  readonly events: WorldEvents;
  /** The chat box. */
  readonly commands: CommandRunner;

  private readonly host: Types2Host;
  private readonly random: SimRandom;
  private bags: Map<string, ItemInventorySpec>;
  private bagNow: OpenBag | null = null;
  private signNow: SignEditing | null = null;

  constructor(files: SimFiles, target: CommandsTarget, host: Types2Host) {
    this.host = host;
    this.random = new SimRandom((host.seed ^ 0x1f123bb5) >>> 0);
    this.weathering = new WeatheringField(host.world, host.catalogue());
    this.events = new WorldEvents(files, host.trace, host.ruleName);
    this.bags = bagsFromFiles(files);
    this.commands = new CommandRunner(files, target, {
      log: host.log,
      feet: () => host.player.position,
      knowsItem: (id) => this.knows(id, true),
      knowsBlock: (id) => this.knows(id, false),
      fire: (owner, eventId, ctx, sentence) =>
        host.triggers().fireOwned(owner, eventId, ctx, sentence),
      listeners: (id, sentence) => {
        this.events.commandRan(id, sentence);
      },
    });
    host.player.setClimbable((x, y, z) => this.climbable(host.world.get({ x, y, z })));
    host.world.onChange((change) => {
      if (change.state === null || !this.isSign(change.state)) this.forgetSign(change.pos);
    });
  }

  /** The bag screen open now, or `null`. */
  get bag(): OpenBag | null {
    return this.bagNow;
  }

  /** The sign being written on now, or `null`. */
  get signEditing(): SignEditing | null {
    return this.signNow;
  }

  /** The bag or bundle an item is, when it is one. */
  bagOf(item: string): ItemInventorySpec | undefined {
    return this.bags.get(item);
  }

  /** The project's bags and bundles, by item id. */
  get bagItems(): ReadonlyMap<string, ItemInventorySpec> {
    return this.bags;
  }

  /** New lowered files (a live edit). */
  setFiles(files: SimFiles, target: CommandsTarget): void {
    this.events.setFiles(files);
    this.commands.setFiles(files, target);
    this.bags = bagsFromFiles(files);
    this.weathering.setCatalogue(this.host.catalogue());
    const open = this.bagNow;
    if (open !== null) {
      const spec = this.bags.get(open.item);
      this.bagNow = spec?.kind === 'bag' ? { ...open, spec } : null;
    }
    const sign = this.signNow;
    if (sign !== null && this.host.world.get(sign.pos)?.name !== sign.block) this.signNow = null;
  }

  /** "Clear the area": signs, open screens and the chat history go. */
  clear(): void {
    this.signs.clear();
    this.bagNow = null;
    this.signNow = null;
    this.commands.clear();
  }

  /** Whether a state can be climbed. */
  climbable(state: BlockState | null): boolean {
    if (state === null) return false;
    const block = this.host.catalogue().blockFor(state.name);
    if (block === undefined) return false;
    return (
      block.climbable === true || (isType2(block.type) && CLIMBABLE_TYPES_2.includes(block.type))
    );
  }

  // Blocks.

  /**
   * A right click on a block of the twenty types (before `msm:on_interact`): its use by hand;
   * a cake's `on_eat` fires here.
   */
  use(pos: BlockPos, state: BlockState, block: CatalogueBlock, item?: string): Types2UseOutcome {
    if (!isType2(block.type)) return { taken: false };
    const catalogue = this.host.catalogue();
    const result = useType2(this.host.world, catalogue, block, block.type, state, {
      pos,
      yaw: this.host.player.yaw,
      random: () => this.random.next(),
      waxed: this.signs.get(pos).waxed,
      ...(item === undefined ? {} : { item }),
    });
    if (!result.handled) return { taken: false };
    for (const change of result.changes) updateNeighbours(this.host.world, catalogue, change.pos);
    if (result.message !== undefined) this.host.log.info(result.message, block.origin);
    if (result.onlyInMinecraft !== undefined) {
      this.host.log.onlyInMinecraft(result.onlyInMinecraft, block.origin);
    }
    if (result.give !== undefined)
      this.host.triggers().inventory.give(result.give.id, result.give.count);
    if (result.ate === true) {
      this.host
        .triggers()
        .fireTrigger(
          'block',
          block.id,
          ON_EAT,
          blockContext(pos),
          `You ate a slice of ${block.displayName}`,
        );
    }
    if (result.editSign !== undefined)
      this.openSignEditor(result.editSign.pos, result.editSign.side);
    return { taken: true };
  }

  /**
   * A player is about to place `block`: the `block.place` rules. Returns false when a rule
   * stopped it (nothing is placed).
   */
  placing(block: string, name: string): boolean {
    if (!this.events.hears('block.place', block)) return true;
    const result = this.events.placing(block, name);
    if (result.cancelled) this.host.log.info(`${name} was not placed: a rule stopped the placing.`);
    return !result.cancelled;
  }

  /** A block was placed at `pos`: a new sign opens its editor; lines the game alone does are said. */
  placed(pos: BlockPos): void {
    const state = this.host.world.get(pos);
    if (state === null) return;
    const block = this.host.catalogue().blockFor(state.name);
    if (block === undefined) return;
    if (block.weathering !== undefined) {
      this.host.sayOnce(
        `weathering:${block.id}`,
        `honeycomb waxing ${block.displayName} and an axe scraping it back (the preview ages it on random ticks and in the time-lapse)`,
        block.origin,
      );
    }
    if (!isType2(block.type)) return;
    const light = lightOf(block.type, state.properties);
    if (light > 0 || block.type === 'candle' || block.type === 'sea_pickle') {
      this.host.sayOnce(
        `light:${block.id}`,
        `the light ${block.displayName} gives (level ${light > 0 ? light : 'by its state'}); the preview draws no light`,
        block.origin,
      );
    }
    this.host.sayOnce(
      `support:${block.id}`,
      `what holds ${block.displayName} in place: the preview keeps it where it was put`,
      block.origin,
    );
    if (block.type === 'scaffolding') {
      this.host.sayOnce(
        'scaffolding:stand',
        'standing on scaffolding and falling scaffolding: the preview lets you climb through it',
        block.origin,
      );
    }
    if (block.type === 'sign' || block.type === 'hanging_sign') {
      this.host.sayOnce(
        `sign-look:${block.id}`,
        `the text drawn on ${block.displayName}'s board (the preview shows it as a mock-up when you look at it)`,
        block.origin,
      );
      this.openSignEditor(pos, 'front');
    }
  }

  // Signs.

  /** The text of the sign at `pos`. */
  signText(pos: BlockPos): SignText {
    return this.signs.get(pos);
  }

  /** Opens the editor of the sign at `pos` (the game opens it on placing and on use). */
  openSignEditor(pos: BlockPos, side: SignSide): void {
    const state = this.host.world.get(pos);
    if (state === null || !this.isSign(state)) return;
    const block = this.host.catalogue().blockFor(state.name) as CatalogueBlock;
    this.host.closeOtherScreens();
    this.bagNow = null;
    this.signNow = {
      pos,
      side,
      block: state.name,
      displayName: block.displayName,
      hanging: block.type === 'hanging_sign',
      origin: block.origin,
    };
  }

  /** Writes on the sign being edited (or the one at `pos`), then closes the editor. */
  writeSign(
    edit: SignEdit,
    pos: BlockPos | undefined = this.signNow?.pos,
    side: SignSide = this.signNow?.side ?? 'front',
  ): SignText | undefined {
    if (pos === undefined) return undefined;
    const state = this.host.world.get(pos);
    if (state === null || !this.isSign(state)) return undefined;
    const name = this.host.catalogue().blockFor(state.name)?.displayName ?? state.name;
    const text = this.signs.edit(pos, side, edit);
    const words = signWords(text[side]);
    this.host.log.info(
      words === ''
        ? `You left the ${side} of ${name} blank.`
        : `You wrote "${words}" on the ${side} of ${name}.`,
    );
    if (edit.glowing === true) {
      this.host.sayOnce(
        'sign:glow',
        'glowing sign text needs a glow ink sac; the preview sets it by the box',
      );
    }
    this.signNow = null;
    return text;
  }

  /** Waxes the sign at `pos` (honeycomb in the game). */
  waxSign(pos: BlockPos): void {
    this.signs.wax(pos);
    this.host.sayOnce('sign:wax', 'waxing a sign takes honeycomb; the preview waxes it by the box');
  }

  /** Closes the sign editor without writing. */
  closeSignEditor(): void {
    this.signNow = null;
  }

  // Bags.

  /**
   * The player uses a held item that is a bag or bundle: a bag opens its screen (`use`, or
   * `sneak_use` only while sneaking) and fires `on_open`. False when it is not one.
   */
  useItem(item: string): boolean {
    const spec = this.bags.get(item);
    if (spec === undefined) return false;
    const triggers = this.host.triggers();
    const owner = triggers.events.get('item', item);
    const name = owner?.displayName ?? triggers.nameOfItem(item);
    const origin: SimOrigin = owner?.origin ?? { elementId: item };
    if (spec.kind === 'bundle') {
      this.host.log.onlyInMinecraft(
        `what ${name} holds and putting things in it (a bundle)`,
        origin,
      );
      return true;
    }
    if (spec.open === 'sneak_use' && !this.host.player.sneaking) {
      this.host.log.info(`${name} opens only while you sneak (hold Shift and use it).`, origin);
      return true;
    }
    this.host.closeOtherScreens();
    this.signNow = null;
    this.bagNow = { item, displayName: name, spec, origin };
    this.host.sayOnce(
      `bag:${item}`,
      `the game's ${bagScreenWords(spec)} for ${name}, with items you can move (the preview shows a mock-up)`,
      origin,
    );
    triggers.fireTrigger(
      'item',
      item,
      BAG_OPEN,
      itemContext(this.host.player.position),
      `You opened ${name}`,
    );
    return true;
  }

  /** Closes the bag screen and fires `on_close`. */
  closeBag(): void {
    const open = this.bagNow;
    if (open === null) return;
    this.bagNow = null;
    this.host
      .triggers()
      .fireTrigger(
        'item',
        open.item,
        BAG_CLOSE,
        itemContext(this.host.player.position),
        `You closed ${open.displayName}`,
      );
  }

  // Weathering.

  /** One tick of weathering (the clock's random ticks). */
  tick(): void {
    const result = this.weathering.tick(() => this.random.next());
    this.sayAged(result, false);
  }

  /** A time-lapse step: a whole in-game day of random ticks at once. */
  timeLapse(ticks: number = TIME_LAPSE_TICKS): AgeingResult {
    const result = this.weathering.timeLapse(() => this.random.next(), ticks);
    if (this.weathering.count === 0 && result.changes.length === 0) {
      this.host.log.info('Nothing here ages: place a block that weathers first.');
      return result;
    }
    this.host.log.info(
      `A time-lapse of ${ticks === TIME_LAPSE_TICKS ? 'one in-game day' : `${ticks} ticks`} went by.`,
    );
    this.sayAged(result, true);
    this.host.sayOnce(
      'weathering:time',
      'how long ageing takes: in the game it comes on random ticks over many in-game days; the time-lapse draws them at the same odds',
    );
    return result;
  }

  // Explosions.

  /**
   * The Explode tool at `pos`: an explosion with no source (as a bed or respawn anchor), so the
   * explosion rules see the cause "a block". A stopped explosion breaks nothing; one with the
   * blocks kept safe breaks nothing; otherwise the blocks within {@link EXPLOSION_RADIUS} go.
   */
  explode(pos: BlockPos): BlockChange[] {
    const world = this.host.world;
    const catalogue = this.host.catalogue();
    const state = world.get(pos);
    const name =
      state === null ? 'the floor' : (catalogue.blockFor(state.name)?.displayName ?? state.name);
    const sentence = `An explosion went off at ${name}`;
    this.host.log.info(`${sentence} (the Explode tool).`);
    this.host.sayOnce(
      'explosion:blast',
      `an explosion's blast: damage, pushing, drops, fire, sound and smoke (the preview only breaks the blocks within ${EXPLOSION_RADIUS} blocks)`,
    );
    const result = this.events.exploding('block', sentence);
    if (result.cancelled) {
      this.host.log.info('The explosion was stopped; nothing broke.');
      return [];
    }
    if (result.keepBlocks) {
      this.host.log.info('The blocks were kept safe; nothing broke.');
      return [];
    }
    const changes: BlockChange[] = [];
    const reach = explosionReach(world, pos);
    for (const at of reach) {
      const left = world.get(at)?.properties.waterlogged === 'true' ? WATER : null;
      if (world.set(at, left)) changes.push({ pos: at, state: left });
    }
    for (const at of reach) changes.push(...updateNeighbours(world, catalogue, at));
    this.host.log.info(
      `The explosion broke ${reach.length} block${reach.length === 1 ? '' : 's'}.`,
    );
    return changes;
  }

  // Commands.

  /** Runs a line typed in the chat box. */
  chat(line: string): ChatLine {
    return this.commands.run(line);
  }

  private sayAged(result: AgeingResult, always: boolean): void {
    const catalogue = this.host.catalogue();
    for (const [id, count] of result.aged) {
      const name = catalogue.blockFor(id)?.displayName ?? id;
      this.host.log.info(`${count} block${count === 1 ? '' : 's'} aged into ${name}.`);
    }
    if (!always) return;
    for (const [id, count] of result.held) {
      const name = catalogue.blockFor(id)?.displayName ?? id;
      this.host.log.info(
        `${count} ${name} block${count === 1 ? '' : 's'} could not age: a block of an earlier stage is near.`,
      );
    }
    if (result.aged.size === 0 && result.held.size === 0) {
      this.host.log.info('Nothing aged this time; ageing is slow, try again.');
    }
  }

  private isSign(state: BlockState): boolean {
    const type = this.host.catalogue().blockFor(state.name)?.type;
    return type === 'sign' || type === 'hanging_sign';
  }

  private forgetSign(pos: BlockPos): void {
    if (this.signs.has(pos)) this.signs.remove(pos);
    const sign = this.signNow;
    if (sign !== null && sign.pos.x === pos.x && sign.pos.y === pos.y && sign.pos.z === pos.z) {
      this.signNow = null;
    }
  }

  private knows(id: string, item: boolean): boolean | undefined {
    if (id.startsWith('minecraft:')) return undefined;
    const triggers = this.host.triggers();
    if (this.host.catalogue().get(id) !== undefined) return true;
    if (item && triggers.events.get('item', id) !== undefined) return true;
    return false;
  }
}

/** The water a waterlogged block leaves behind. */
const WATER: BlockState = Object.freeze({
  name: 'minecraft:water',
  properties: Object.freeze({ level: '0' }),
});

const blockContext = (pos: BlockPos): EventContext => ({
  source: 'block',
  base: pos,
  origin: { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 },
  player: true,
  block: pos,
  other: PLAYER,
});

const itemContext = (feet: { x: number; y: number; z: number }): EventContext => ({
  source: 'item',
  base: { x: Math.floor(feet.x), y: Math.floor(feet.y) - 1, z: Math.floor(feet.z) },
  origin: feet,
  player: true,
  other: PLAYER,
});
