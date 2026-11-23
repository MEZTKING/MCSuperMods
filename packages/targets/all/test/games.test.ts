import { readFile } from 'node:fs/promises';
import type { CommandFormName, Json } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  validateJson,
} from '@msm/schemas';
import { createMcfunctionService, defaultFunctionUri } from '@msm/schemas/mcfunction';
import { describe, expect, it } from 'vitest';
import { builtInTargets, readVendoredJson, type TargetBundle, targetFacts } from '../src/index';

/**
 * The game kits' facts (ADR 0113 D8; plugin API 1.22.0): `worlds`, `scoreboard` and
 * `commands.forms`, measured by B547 (`docs/reference/spikes/b547/README.md`) and tied here to
 * each target's vendored registries, command tree and mcdoc, and to the offline function checker.
 * Since plugin API 1.27.0 also the community game types' facts (ADR 0132), measured by B720
 * (`docs/reference/spikes/b720/README.md`): more criteria, the game rules they set, their
 * command forms and fragments, and `dataForms`.
 */

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface CommandNode {
  type: string;
  parser?: string;
  children?: Record<string, CommandNode>;
  redirect?: string[];
}

/** Sample text for each placeholder, as the lowering would write it. */
const SAMPLES: Readonly<Record<string, string>> = {
  team: 'msm_red',
  display_name: '{text:"Red",color:"red"}',
  colour: 'red',
  boolean: 'false',
  name_tags: 'hideForOtherTeams',
  collision: 'pushOwnTeam',
  death_messages: 'never',
  text: '{text:"Ten seconds"}',
  members: '@a',
  objective: 'msm.score',
  criterion: 'dummy',
  slot: 'sidebar.team.red',
  render_type: 'hearts',
  number_format: 'styled {color:"yellow",bold:true}',
  holders: '@a',
  holder: '@s',
  score: '5',
  bossbar: 'msm:timer',
  max: '60',
  value: '42',
  bossbar_colour: 'red',
  bossbar_style: 'notched_10',
  players: '@a',
  command: 'scoreboard players get @s msm.score',
  width: '2000',
  seconds: '5',
  x: '0',
  y: '64',
  z: '0',
  x1: '0',
  z1: '0',
  x2: '31',
  z2: '31',
  distance: '5',
  template: 'msm:island',
  structure: 'minecraft:village_plains',
  rotation: 'clockwise_90',
  mirror: 'front_back',
  integrity: '1.0',
  seed: '7',
  loot_table: 'minecraft:chests/simple_dungeon',
  min: '1',
  max_roll: '6',
  sequence: 'msm:one_block',
  // The Rules forms and the game kits' other lines (plugin API 1.26.0).
  entities: '@s[tag=msm.area.arena]',
  range: '0..',
  ticks: '100',
  function: 'msm:msm_games/start',
  tag: 'msm.area.arena',
  dimension: 'minecraft:overworld',
  anchor: '@s',
  predicate: 'msm:msm_games/area/arena',
  storage: 'msm:msm_games',
  nbt_path: 'world_setup',
  nbt: '1b',
  holder_2: '#arena.ticks',
  objective_2: 'msm.score',
  range_2: '20..',
  block: 'minecraft:chest{LootTable:"minecraft:chests/simple_dungeon"}',
  entity_type: 'minecraft:zombie',
  game_mode: 'survival',
  difficulty: 'normal',
  rule: 'keep_inventory',
  rule_value: 'true',
  item: 'minecraft:stone',
  count: '1',
  item_slot: 'hotbar.0',
  effect: 'minecraft:speed',
  amplifier: '0',
  hide_particles: 'false',
  dialog: 'minecraft:server_links',
  // The community game types' lines (plugin API 1.27.0), as the B720 spike wrote them.
  entity: '@s',
  attribute: 'minecraft:max_health',
  modifier: 'msm:hold',
  amount: '-1',
  operation: 'add_multiplied_total',
  scale: '2',
  source_path: 'Pos',
  block_path: 'Items[0].components."minecraft:profile".name',
  block_slot: 'container.0',
  item_slots: 'weapon.mainhand',
  item_predicate: 'minecraft:compass[minecraft:custom_data~{msm_tracker:1b}]',
  block_predicate: '#minecraft:beds[part=foot]',
  block_predicate_2: '#minecraft:beds[part=head]',
  x_2: '0',
  y_2: '64',
  z_2: '-1',
  comparison: '<=',
  score_operation: '+=',
  y1: '40',
  y2: '40',
  max_count: '0',
  advancement: 'msm:msm_games/kill',
  item_modifier: '{type:"minecraft:set_components",components:{"minecraft:max_stack_size":16}}',
  profession: 'minecraft:armorer',
  villager_type: 'minecraft:plains',
  offers:
    '{buy:{id:"minecraft:iron_ingot",count:4},sell:{id:"minecraft:iron_sword",count:1},maxUses:2147483647,rewardExp:0b,xp:0}',
  buy: '{id:"minecraft:iron_ingot",count:4}',
  buy_b: '{id:"minecraft:gold_ingot",count:1}',
  sell: '{id:"minecraft:iron_sword",count:1,components:{"minecraft:custom_name":{text:"Team sword",italic:false},"minecraft:unbreakable":{}}}',
};

/** The command forms of the community game types (plugin API 1.27.0, the B720 spike). */
const GAME_TYPE_FORMS: readonly CommandFormName[] = [
  'attribute_base_set',
  'attribute_modifier_add',
  'attribute_modifier_remove',
  'attribute_get',
  'trigger',
  'trigger_add',
  'trigger_set',
  'time_query_gametime',
  'store_result_storage_run',
  'function_with_storage',
  'storage_set_from_entity',
  'storage_set_from_block',
  'data_get_entity',
  'data_get_storage',
  'loot_replace_block',
  'on_attacker_run',
  'at_run',
  'as_at_run',
  'if_entity_run',
  'if_items_run',
  'if_block_if_block_run',
  'unless_block_run',
  'if_score_compare_run',
  'unless_score_compare_run',
  'as_if_score_compare_run',
  'as_unless_score_compare_run',
  'store_result_score_if_entity',
  'score_operation',
  'score_reset',
  'item_modify_entity',
  'clear',
  'effect_clear',
  'fill',
  'team_empty',
  'advancement_revoke_only',
  'summon_item',
  'summon_trader',
];

/**
 * A warning the offline checker gives for a line the game runs: on 26.4 the inline item
 * modifier of `item modify` (`{type:"minecraft:set_components",...}`) draws "Unknown key"
 * warnings for its own keys, while B720 K7 ran the same line on that version's dedicated server
 * and the compass was pointed. A checker gap, as the spike's `summon minecraft:block_display`
 * one; errors are never excused.
 */
function knownCheckerGap(targetId: string, line: string, message: string): boolean {
  return (
    targetId === 'mc-26.4' &&
    line.startsWith('item modify entity ') &&
    /^Unknown key “(type|components)”$/.test(message)
  );
}

/**
 * Fills a data form: each JSON string whose whole text is `<name>` becomes `values[name]`.
 * Throws on a placeholder without a value.
 */
function fillJson(form: Json, values: Readonly<Record<string, Json>>): Json {
  if (typeof form === 'string') {
    const name = /^<([a-z0-9_]+)>$/.exec(form)?.[1];
    if (name === undefined) return form;
    const value = values[name];
    if (value === undefined) throw new Error(`no value for ${name}`);
    return value;
  }
  if (Array.isArray(form)) return form.map((item) => fillJson(item, values));
  if (form !== null && typeof form === 'object') {
    return Object.fromEntries(
      Object.entries(form).map(([key, item]) => [key, fillJson(item, values)]),
    );
  }
  return form;
}

/** Fills every placeholder of `form` with its sample, optional ones included. */
function fill(form: string): string {
  return form
    .replace(/<min>\.\.<max>/g, `${SAMPLES.min}..${SAMPLES.max_roll}`)
    .replace(/[<[]([a-z0-9_]+)[>\]]/g, (_, name: string) => {
      const sample = SAMPLES[name];
      if (sample === undefined) throw new Error(`no sample for ${name}`);
      return sample;
    });
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'game kit facts of %s (ADR 0113 D8)',
  (_id, bundle: TargetBundle) => {
    const { target } = bundle;

    it('names world facts the vendored registries know', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const worlds = target.worlds;
      expect(worlds?.structurePlacements).toEqual(
        [...(registries['worldgen/structure_placement'] ?? [])]
          .sort()
          .map((id) => `minecraft:${id}`),
      );
      expect(worlds?.structurePlacements).toContain('minecraft:dimension_origin');
      const bare = (id: string | undefined): string => (id ?? '').replace(/^minecraft:/, '');
      expect(registries['worldgen/biome']).toContain(bare(worlds?.voidBiome));
      expect(registries['worldgen/noise_settings']).toContain(
        bare(worlds?.floatingIslandsSettings),
      );
      // Not measured by B547: left out until it is.
      expect(worlds?.endLikeSettings).toBeUndefined();
      expect(registries['worldgen/placement_modifier_type']).toContain(
        bare(worlds?.fixedPlacementShape.type),
      );
      expect(registries.trigger_type).toContain(bare(worlds?.firstJoinCriterion));
      expect(targetFacts(target.id)?.worlds).toEqual(worlds);
    });

    it('lists scoreboard facts the vendored command tree, registries and mcdoc know', async () => {
      const commands = (await readVendoredJson(bundle, 'mcmetaCommands', nodeReadFile)) as {
        children: Record<string, CommandNode>;
      };
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const symbols = (await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile)) as {
        mcdoc: Record<string, { values?: { value: string }[] }>;
      };
      const scoreboard = target.scoreboard;
      const literals = (node: CommandNode | undefined): string[] =>
        Object.entries(node?.children ?? {})
          .filter(([, child]) => child.type === 'literal')
          .map(([name]) => name)
          .sort();
      const only = (node: CommandNode | undefined): CommandNode | undefined =>
        Object.values(node?.children ?? {})[0];
      const objectives = commands.children.scoreboard?.children?.objectives?.children;
      const modify = only(objectives?.modify)?.children;
      expect(scoreboard?.renderTypes.slice().sort()).toEqual(literals(modify?.rendertype));
      expect(scoreboard?.numberFormats).toEqual(literals(modify?.numberformat));
      const team = only(commands.children.team?.children?.modify)?.children;
      expect(scoreboard?.nameTagVisibility).toEqual(literals(team?.nametagVisibility));
      expect(scoreboard?.collisionRules).toEqual(literals(team?.collisionRule));
      expect(scoreboard?.deathMessageVisibility).toEqual(literals(team?.deathMessageVisibility));
      expect(team?.color?.children?.value?.parser).toBe('minecraft:team_color');
      expect(scoreboard?.teamColours).toEqual(
        symbols.mcdoc['::java::util::text::TextColor']?.values?.map(({ value }) => value),
      );
      expect(scoreboard?.teamColours).toHaveLength(16);
      expect(only(objectives?.setdisplay)?.parser).toBe('minecraft:scoreboard_slot');
      expect(scoreboard?.displaySlots).toEqual([
        'list',
        'sidebar',
        'below_name',
        ...(scoreboard?.teamColours ?? []).map((colour) => `sidebar.team.${colour}`),
      ]);
      expect(scoreboard?.statTypes).toEqual([...(registries.stat_type ?? [])].sort());
      // B547 Y10's three, then B720 K1's `deathCount`, `totalKillCount` and `trigger` (1.27.0).
      expect(scoreboard?.criteria).toEqual([
        'deathCount',
        'dummy',
        'health',
        'playerKillCount',
        'totalKillCount',
        'trigger',
      ]);
      expect(scoreboard?.criteria).toEqual([...(scoreboard?.criteria ?? [])].sort());
      expect(targetFacts(target.id)?.scoreboard).toEqual(scoreboard);
    });

    it('writes command forms whose words the vendored command tree has', async () => {
      const commands = (await readVendoredJson(
        bundle,
        'mcmetaCommands',
        nodeReadFile,
      )) as CommandNode;
      const forms = target.commands?.forms;
      expect(forms).toBeDefined();
      for (const [name, form] of Object.entries(forms ?? {})) {
        // Walk the leading literal words down the tree (through a redirect such as `tp`'s);
        // the first placeholder must be an argument there, or, where the game lists only
        // literals (`difficulty`, `gamerule`), its sample must be one of them.
        let node: CommandNode | undefined = commands;
        for (const word of form.split(' ')) {
          const redirect: readonly string[] | undefined = node?.redirect;
          if (redirect !== undefined && node?.children === undefined) {
            node = redirect.reduce<CommandNode | undefined>(
              (at, step) => at?.children?.[step],
              commands,
            );
          }
          if (word === '<command>') {
            // `run` has no children: it goes back to the root of the tree.
            expect(node?.children, `${name}: ${word}`).toBeUndefined();
            break;
          }
          if (/[<[]/.test(word)) {
            const children = Object.entries(node?.children ?? {});
            const kinds = children.map(([, child]) => child.type);
            if (kinds.includes('argument')) break;
            const placeholder = /[<[]([a-z0-9_]+)[>\]]/.exec(word)?.[1] ?? '';
            expect(
              children.map(([literal]) => literal),
              `${name}: ${word}`,
            ).toContain(SAMPLES[placeholder]);
            break;
          }
          const next: CommandNode | undefined = node?.children?.[word];
          if (next === undefined) {
            // Ready text for an argument, such as `summon`'s `minecraft:item`.
            const kinds = Object.values(node?.children ?? {}).map((child) => child.type);
            expect(kinds, `${name}: ${word}`).toContain('argument');
            break;
          }
          node = next;
          expect(node?.type, `${name}: ${word}`).toBe('literal');
        }
      }
      expect(targetFacts(target.id)?.commands?.forms).toEqual(forms);
    });

    it('writes command forms the offline function checker accepts', async () => {
      const [commands, blocks, registries, mcdocSymbols] = await Promise.all([
        readVendoredJson(bundle, 'mcmetaCommands', nodeReadFile),
        readVendoredJson(bundle, 'mcmetaBlocks', nodeReadFile),
        readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile),
        readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      ]);
      const service = await createMcfunctionService(
        { commands, blocks, registries: registries as Record<string, string[]> },
        { mcVersion: target.mcVersion, mcdocSymbols },
      );
      const uri = defaultFunctionUri('msm', 'games', target.folders.data.function);
      const projectIds = {
        objective: ['msm.score'],
        team: ['msm_red'],
        structure: ['msm:island'],
        function: ['msm:msm_games/start'],
        predicate: ['msm:msm_games/area/arena'],
        advancement: ['msm:msm_games/kill'],
      };
      const forms = (target.commands?.forms ?? {}) as Readonly<Record<CommandFormName, string>>;
      for (const [name, form] of Object.entries(forms)) {
        const line = fill(form);
        const problems = await service.check(line, { uri, projectIds });
        expect(
          problems.filter((problem) => problem.severity === 'error'),
          `${name}: ${line}`,
        ).toEqual([]);
      }
      // The seconds form keeps its unit: a bare number would be ticks (B547 Y10).
      expect(fill(forms.worldborder_set_over_seconds)).toBe('worldborder set 2000 5s');
      // The redirect is walked: `tp` stays the word the game kits always wrote.
      expect(fill(forms.teleport)).toBe('tp @s[tag=msm.area.arena] 0 64 0');
      // The game types' lines (1.27.0) pass with no warning either (ADR 0132's rule), and each
      // fragment, filled, makes a line the checker accepts in the placeholder it fills.
      const fragments = target.commands?.fragments;
      expect(fragments).toBeDefined();
      if (fragments === undefined) return;
      const gameTypeLines = [
        ...GAME_TYPE_FORMS.map((name) => fill(forms[name])),
        fill(forms.summon_trader).replace(
          SAMPLES.offers as string,
          `${fill(fragments.trade_offer)},${fill(fragments.trade_offer_two)}`,
        ),
        fill(forms.item_modify_entity).replace(
          SAMPLES.item_modifier as string,
          fill(fragments.lodestone_tracker_modifier),
        ),
      ];
      for (const line of gameTypeLines) {
        const problems = await service.check(line, { uri, projectIds });
        expect(
          problems.filter((problem) => !knownCheckerGap(target.id, line, problem.message)),
          line,
        ).toEqual([]);
      }
    }, 120_000);

    it('lists the criteria, statistics and game rules B720 measured', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const scoreboard = target.scoreboard;
      expect(scoreboard?.teamCriteria).toEqual(['killedByTeam', 'teamkill']);
      expect(scoreboard?.customStatCriteria).toEqual([
        'minecraft.custom:minecraft.deaths',
        'minecraft.custom:minecraft.leave_game',
        'minecraft.custom:minecraft.player_kills',
        'minecraft.custom:minecraft.time_since_death',
      ]);
      const prefix = target.stats?.criterionPrefix ?? '';
      for (const criterion of scoreboard?.customStatCriteria ?? []) {
        expect(criterion.startsWith(prefix), criterion).toBe(true);
        const id = criterion.slice(prefix.length).replace(/^minecraft\./, '');
        expect(registries.custom_stat, criterion).toContain(id);
        expect(target.stats?.vanillaCustomStats).toContain(id);
      }
      const rules = target.gameRules;
      expect(rules?.forGames).toEqual([...(rules?.forGames ?? [])].sort());
      for (const rule of rules?.forGames ?? []) {
        expect(rules?.vanillaNames, rule).toContain(rule);
        expect(registries.game_rule, rule).toContain(rule);
      }
      expect(targetFacts(target.id)?.gameRules).toEqual(rules);
    });

    it('writes data forms the vendored mcdoc accepts', async () => {
      const symbols = parseVanillaMcdocSymbols(
        await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      );
      const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
      const registries = createRegistryIndex({
        vanilla: (await readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile)) as Record<
          string,
          string[]
        >,
      });
      const forms = target.dataForms;
      expect(forms).toBeDefined();
      if (forms === undefined) return;
      const condition = fillJson(forms.entity_is_type, { entity_type: 'minecraft:player' });
      const criteria: Record<string, Json> = {
        killed_player: fillJson(forms.player_killed_entity, { entity_condition: condition }),
        killed_dragon: fillJson(forms.player_killed_entity, {
          entity_condition: fillJson(forms.entity_is_type, {
            entity_type: 'minecraft:ender_dragon',
          }),
        }),
        ate_heart: fillJson(forms.consume_item_with_data, {
          item: 'minecraft:red_dye',
          custom_data: '{msm_heart:1b}',
        }),
      };
      const problemsOf = (resource: string, value: Json): string[] => {
        const node = index.dispatch('minecraft:resource', resource);
        if (node === undefined) throw new Error(`no ${resource} schema`);
        return validateJson(value, node, { registries }).map(
          (problem) => `${problem.severity} ${problem.path} ${problem.code}`,
        );
      };
      for (const [id, criterion] of Object.entries(criteria)) {
        const advancement: Json = {
          criteria: { c: criterion },
          rewards: { function: 'msm:msm_games/kill' },
        };
        expect(problemsOf('advancement', advancement), id).toEqual([]);
      }
      // The one-condition form: a list where the game wants one condition is refused.
      expect(
        problemsOf('advancement', {
          criteria: { c: fillJson(forms.player_killed_entity, { entity_condition: [condition] }) },
        }),
      ).not.toEqual([]);
      const lootTable: Json = {
        type: 'minecraft:command',
        pools: [{ rolls: 1, entries: [forms.player_head_of_this] }],
      };
      expect(problemsOf('loot_table', lootTable)).toEqual([]);
      // Left out until measured: B720 wrote the victim's `entity_killed_player` condition under
      // `killing_entity`, which the vendored mcdoc does not know (its field is `entity`).
      expect(Object.keys(forms)).not.toContain('entity_killed_player');
      expect(targetFacts(target.id)?.dataForms).toEqual(forms);
    });
  },
);
