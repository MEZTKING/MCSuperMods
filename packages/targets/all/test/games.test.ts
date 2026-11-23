import { readFile } from 'node:fs/promises';
import type { CommandFormName } from '@msm/plugin-api';
import { createMcfunctionService, defaultFunctionUri } from '@msm/schemas/mcfunction';
import { describe, expect, it } from 'vitest';
import { builtInTargets, readVendoredJson, type TargetBundle, targetFacts } from '../src/index';

/**
 * The game kits' facts (ADR 0113 D8; plugin API 1.22.0): `worlds`, `scoreboard` and
 * `commands.forms`, measured by B547 (`docs/reference/spikes/b547/README.md`) and tied here to
 * each target's vendored registries, command tree and mcdoc, and to the offline function checker.
 */

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface CommandNode {
  type: string;
  parser?: string;
  children?: Record<string, CommandNode>;
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
};

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
      expect(scoreboard?.criteria).toEqual(['dummy', 'health', 'playerKillCount']);
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
        // Walk the leading literal words down the tree; the first placeholder must be an
        // argument there.
        let node: CommandNode | undefined = commands;
        for (const word of form.split(' ')) {
          if (/[<[]/.test(word)) {
            const kinds = Object.values(node?.children ?? {}).map((child) => child.type);
            expect(kinds, `${name}: ${word}`).toContain('argument');
            break;
          }
          node = node?.children?.[word];
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
    }, 120_000);
  },
);
