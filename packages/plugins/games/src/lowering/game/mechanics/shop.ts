/**
 * The mechanic `shop` of `msm:game` (ADR 0132 D2; B726, the spike's K13): places where players
 * buy gear with items. Shops stand from a round's start (made again at each, the last round's
 * removed first) in the game's dimension; the shop `<i>`'s entity carries the tag
 * `<ns>.game.<path>.shop.<i>`.
 *
 * - **A trader** (`way: trader`): a villager that stands still and cannot be hurt, whose offers
 *   are its `Offers` NBT (`summon_trader` with the target's `trade_offer` and `trade_offer_two`
 *   fragments): K13 found that offers from data alone change every villager of a job. A trader
 *   serves anyone (vanilla trading cannot ask for a team; the check says so) and shows no name.
 * - **A menu** (`way: menu`): an `interaction` entity one block wide on the shop's place (the map
 *   puts a sign or a counter there). A player who hits it gets a dialog with a buy button per
 *   offer (K13's multi-action dialog); a button runs `trigger <ns>.msm_shop set <n>`, with `n` =
 *   100 × shop + offer + 1, and the tick hands the trigger to `buy`, which counts what the player
 *   has without taking it (`clear ... 0`), then takes the cost and gives the item, or says what
 *   is missing (K13). A menu of a team opens only for that team. The trigger is enabled when the
 *   menu opens (K5: one trigger per enable), and the menu opens again after a purchase.
 *
 * Functions under `<ns>:msm_games/game/<path>/shop/`: `make` (hook `starting`: every shop
 * removed and made again), and for menus `tick` (hook `tick`), `hit` (as an interaction: the
 * attacker is found with `execute on attacker`; the interaction is made again, which clears its
 * memory of the hit), `<i>/opened` (as the interaction), `<i>/open` and `<i>/menu` (as the
 * player), `buy`, `<i>/buy/<j>` and `<i>/pay/<j>`.
 */
import type { Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { itemArgument, snbtOf } from '../../kit';
import { blockPos, isRecord, num, titleOf } from '../../shared-functions';
import { refOrUndefined } from '../names';
import type { MechanicLowering } from './index';
import {
  addGameIds,
  IdList,
  type MechanicIds,
  mechanicBuild,
  mechanicObjective,
  namesOf,
} from './kill-pair';
import { fillFragment } from './tracker';

/** One stack paid or bought. */
export interface ShopStackSettings {
  readonly item: string;
  readonly count: number;
  readonly components?: Json;
}

/** One offer of a shop. */
export interface ShopOfferSettings {
  readonly cost: ShopStackSettings;
  readonly costB?: ShopStackSettings;
  readonly gives: ShopStackSettings;
}

/** One shop, with its defaults. */
export interface ShopSettings {
  readonly name: string;
  readonly at: readonly [number, number, number];
  readonly way: 'trader' | 'menu';
  readonly team?: string;
  readonly offers: readonly ShopOfferSettings[];
}

const ITEM_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/** The most offers a shop has (the schema's), which the trigger's numbers rely on. */
export const MAX_OFFERS = 64;

const stackOf = (value: Json | undefined): ShopStackSettings | undefined => {
  if (!isRecord(value) || typeof value.item !== 'string' || !ITEM_ID.test(value.item)) {
    return undefined;
  }
  return {
    item: value.item,
    count: Math.min(99, Math.max(1, Math.trunc(num(value.count, 1)))),
    ...(isRecord(value.components) ? { components: value.components } : {}),
  };
};

/** Reads the shops of a `shop` mechanic; offers without a cost or an item bought are left out. */
export function readShops(mechanic: JsonObject): ShopSettings[] {
  const list: Json[] = Array.isArray(mechanic.shops) ? mechanic.shops : [];
  return list.filter(isRecord).map((shop) => {
    const offers: ShopOfferSettings[] = [];
    for (const offer of (Array.isArray(shop.offers) ? shop.offers : []).filter(isRecord)) {
      const cost = stackOf(offer.cost);
      const gives = stackOf(offer.gives);
      const costB = stackOf(offer.cost_b);
      if (cost === undefined || gives === undefined) continue;
      offers.push({ cost, gives, ...(costB === undefined ? {} : { costB }) });
    }
    const team = refOrUndefined(shop.team);
    return {
      name: typeof shop.name === 'string' && shop.name !== '' ? shop.name : 'Shop',
      at: blockPos(shop.at),
      way: shop.way === 'menu' ? 'menu' : 'trader',
      ...(team === undefined ? {} : { team }),
      offers: offers.slice(0, MAX_OFFERS),
    };
  });
}

/** The trigger a menu's buttons set: `<ns>.msm_shop`. */
export const shopTrigger = (namespace: string): string => mechanicObjective(namespace, 'shop');

/** The trigger's value for offer `j` of shop `i`. */
export const offerNumber = (i: number, j: number): number => i * 100 + j + 1;

/** A stack as a trader's SNBT item: `{id:"...",count:n}`, with components when it has any. */
const tradeItem = (stack: ShopStackSettings): string =>
  snbtOf({
    id: stack.item,
    count: stack.count,
    ...(isRecord(stack.components) && Object.keys(stack.components).length > 0
      ? { components: stack.components }
      : {}),
  });

/** A stack in words: `4 Iron Ingot`. */
const stackWords = (stack: ShopStackSettings): string =>
  `${stack.count} ${titleOf(stack.item.slice(stack.item.indexOf(':') + 1))}`;

/** The profession and type a trader is made with (any job will do: its offers are its own). */
const TRADER = Object.freeze({ profession: 'minecraft:armorer', type: 'minecraft:plains' });

/** Lowers the `shop` mechanic. */
export const lowerShop: MechanicLowering = (mechanic, context): OutputFile[] => {
  const build = mechanicBuild(context);
  const { game, names } = build;
  const shops = readShops(mechanic);
  if (shops.length === 0) return [];
  const objective = names.objective;
  const trigger = shopTrigger(game.namespace);
  const opening = names.tag('shop.opening');
  const menuTag = names.tag('shop.menu');
  const shopTag = (i: number): string => names.tag(`shop.${i}`);
  const inGame = (command: string): string =>
    build.form('in_run', { dimension: game.dimension, command });
  const hasMenus = shops.some((shop) => shop.way === 'menu' && shop.offers.length > 0);

  const make: string[] = [];
  const files: OutputFile[] = [];
  const hit = [
    build.form('on_attacker_run', {
      command: build.form('tag_add', { entities: '@s', tag: opening }),
    }),
  ];
  const buy: string[] = [];
  shops.forEach((shop, i) => {
    const [x, y, z] = shop.at;
    const cx = x + 0.5;
    const cz = z + 0.5;
    const type = shop.way === 'menu' ? 'minecraft:interaction' : 'minecraft:villager';
    make.push(inGame(build.form('kill', { entities: `@e[type=${type},tag=${shopTag(i)}]` })));
    if (shop.offers.length === 0) return;
    if (shop.way === 'trader') {
      const offers = shop.offers
        .map((offer) =>
          offer.costB === undefined
            ? fillFragment(build.target, 'trade_offer', {
                buy: tradeItem(offer.cost),
                sell: tradeItem(offer.gives),
              })
            : fillFragment(build.target, 'trade_offer_two', {
                buy: tradeItem(offer.cost),
                buy_b: tradeItem(offer.costB),
                sell: tradeItem(offer.gives),
              }),
        )
        .join(',');
      make.push(
        inGame(
          build.form('summon_trader', {
            x: cx,
            y,
            z: cz,
            tag: shopTag(i),
            profession: TRADER.profession,
            villager_type: TRADER.type,
            offers,
          }),
        ),
      );
      return;
    }

    // A menu: the interaction, tagged once it stands.
    const fresh = `@e[type=minecraft:interaction,x=${cx},y=${y},z=${cz},distance=..0.1,tag=!${menuTag}]`;
    const summon = [
      inGame(build.form('summon', { entity_type: 'minecraft:interaction', x: cx, y, z: cz })),
      inGame(
        build.form('as_run', {
          entities: fresh,
          command: build.run(`shop/${i}/tag`),
        }),
      ),
    ];
    make.push(...summon);
    files.push(
      build.file(`shop/${i}/tag`, [
        build.form('tag_add', { entities: '@s', tag: menuTag }),
        build.form('tag_add', { entities: '@s', tag: shopTag(i) }),
      ]),
    );
    hit.push(
      build.form('if_entity_run', {
        entities: `@s[tag=${shopTag(i)}]`,
        command: build.form('if_entity_run', {
          entities: `@a[tag=${opening}]`,
          command: build.run(`shop/${i}/opened`),
        }),
      }),
    );
    files.push(
      build.file(`shop/${i}/opened`, [
        build.form('as_run', {
          entities: `@a[tag=${opening}]`,
          command: build.run(`shop/${i}/open`),
        }),
        build.form('kill', { entities: '@s' }),
        ...summon,
      ]),
    );
    const open: string[] = [];
    if (shop.team === undefined) open.push(build.run(`shop/${i}/menu`));
    else {
      const team = names.team(shop.team);
      open.push(
        build.form('if_entity_run', {
          entities: `@s[team=${team}]`,
          command: build.run(`shop/${i}/menu`),
        }),
        build.form('if_entity_run', {
          entities: `@s[team=!${team}]`,
          command: build.say('@s', `${shop.name} sells only to its own team.`),
        }),
      );
    }
    files.push(build.file(`shop/${i}/open`, open));
    const dialog = snbtOf({
      type: 'minecraft:multi_action',
      title: { text: shop.name },
      actions: shop.offers.map((offer, j) => ({
        label: {
          text: `${stackWords(offer.gives)} for ${stackWords(offer.cost)}${
            offer.costB === undefined ? '' : ` and ${stackWords(offer.costB)}`
          }`,
        },
        action: {
          type: 'minecraft:run_command',
          command: build.form('trigger_set', { objective: trigger, value: offerNumber(i, j) }),
        },
      })),
    });
    files.push(
      build.file(`shop/${i}/menu`, [
        build.form('score_enable', { holders: '@s', objective: trigger }),
        build.form('dialog_show', { players: '@s', dialog }),
      ]),
    );
    shop.offers.forEach((offer, j) => {
      buy.push(
        build.form('if_score_run', {
          holder: '@s',
          objective: trigger,
          range: String(offerNumber(i, j)),
          command: build.run(`shop/${i}/buy/${j}`),
        }),
      );
      const costs = [offer.cost, ...(offer.costB === undefined ? [] : [offer.costB])];
      const have = (k: number): string => `shop.have.${k}`;
      const lines: string[] = [];
      costs.forEach((cost, k) => {
        lines.push(
          build.setHolder(have(k), 0),
          build.form('store_result_score_run', {
            holder: names.holder(have(k)),
            objective,
            command: build.form('clear', {
              players: '@s',
              item_predicate: cost.item,
              max_count: 0,
            }),
          }),
        );
      });
      const pay = build.run(`shop/${i}/pay/${j}`);
      const [first, second] = costs as [ShopStackSettings, ShopStackSettings | undefined];
      lines.push(
        second === undefined
          ? build.form('if_score_run', {
              holder: names.holder(have(0)),
              objective,
              range: `${first.count}..`,
              command: pay,
            })
          : build.form('if_score_if_score_run', {
              holder: names.holder(have(0)),
              objective,
              range: `${first.count}..`,
              holder_2: names.holder(have(1)),
              objective_2: objective,
              range_2: `${second.count}..`,
              command: pay,
            }),
      );
      costs.forEach((cost, k) => {
        lines.push(
          build.form('unless_score_run', {
            holder: names.holder(have(k)),
            objective,
            range: `${cost.count}..`,
            command: build.say('@s', `You need ${stackWords(cost)} for that.`),
          }),
        );
      });
      files.push(
        build.file(`shop/${i}/buy/${j}`, lines),
        build.file(`shop/${i}/pay/${j}`, [
          ...costs.map((cost) =>
            build.form('clear', {
              players: '@s',
              item_predicate: cost.item,
              max_count: cost.count,
            }),
          ),
          build.form('give', {
            players: '@s',
            item: itemArgument(offer.gives.item, offer.gives.components),
            count: offer.gives.count,
          }),
          build.run(`shop/${i}/menu`),
        ]),
      );
    });
  });

  files.push(build.file('shop/make', make), build.hookFile('starting', [names.fn('shop/make')]));
  if (hasMenus) {
    buy.push(build.form('score_set', { holders: '@s', objective: trigger, score: 0 }));
    hit.push(build.form('tag_remove', { entities: '@a', tag: opening }));
    files.push(
      ...build.loadFiles('shop/load', [
        build.form('objective_add', { objective: trigger, criterion: 'trigger' }),
      ]),
      build.file('shop/tick', [
        build.form('as_run', {
          entities: `@e[type=minecraft:interaction,tag=${menuTag}]`,
          command: build.run('shop/hit'),
        }),
        build.form('as_run', {
          entities: `@a[scores={${trigger}=1..}]`,
          command: build.run('shop/buy'),
        }),
      ]),
      build.file('shop/hit', hit),
      build.file('shop/buy', buy),
      build.hookFile('tick', [names.fn('shop/tick')]),
    );
  }
  return files;
};

/** The ids the `shop` mechanic writes, for `gamesGeneratedIds`. */
export const shopGeneratedIds: MechanicIds = (mechanic, element) => {
  const names = namesOf(element);
  const shops = readShops(mechanic);
  if (shops.length === 0) return {};
  const functions = ['make'];
  const list = new IdList();
  shops.forEach((shop, i) => {
    if (shop.way !== 'menu' || shop.offers.length === 0) return;
    functions.push(
      `${i}/tag`,
      `${i}/opened`,
      `${i}/open`,
      `${i}/menu`,
      ...shop.offers.flatMap((_offer, j) => [`${i}/buy/${j}`, `${i}/pay/${j}`]),
    );
    list.add('tag', names.tag(`shop.${i}`));
  });
  const menus = functions.length > 1;
  if (menus) {
    functions.push('load', 'tick', 'hit', 'buy');
    list
      .add('objective', shopTrigger(names.namespace))
      .add('tag', names.tag('shop.opening'), names.tag('shop.menu'));
  }
  return addGameIds(
    list,
    names,
    functions.map((name) => `shop/${name}`),
    menus ? ['starting', 'tick'] : ['starting'],
    menus,
  ).done();
};
