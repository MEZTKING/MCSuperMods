/**
 * `VERIFY.md`: the checklist a new or re-pinned target carries until a person has worked
 * through it (ADR 0136 D11). It lists the derived facts as recomputed, the upstream drafts,
 * every hand-verified fact of the previous target with its last date and source (each row of
 * its `CHANGES.md`), the tests, goldens, GameTests and parity fixtures to rerun, and the work
 * that stays manual by design. Pure: the caller gathers the inputs.
 *
 * @packageDocumentation
 */

import { type FactComparison, listDelta, releaseLine, showValue } from './derive.ts';
import type { DraftValue, UpstreamDraft } from './fabric-meta.ts';

/**
 * The kind of each fact, from B810 V20 (`docs/reference/spikes/b810/results/v20-classes.json`):
 * `D` derived from vendored data, `D+H` derived and then cut or extended by a person, `U` from an
 * upstream service, `H` hand-verified (javap, a server or client run, a jar, a screen), `M` MSM's
 * own. A fact a target has and this table does not is listed as not classified.
 */
export const FACT_CLASSES: Readonly<Record<string, 'D' | 'D+H' | 'U' | 'H' | 'M'>> = {
  id: 'D',
  mcVersion: 'D',
  channel: 'D',
  dataVersion: 'D',
  'packFormats.data': 'D',
  'packFormats.resource': 'D',
  mcdocRef: 'D',
  mcmetaRef: 'D',
  previous: 'M',
  // The change set: its generated half is tied to the vendored data by its own `--check`, its
  // curated half is MSM's (B813).
  changes: 'M',
  java: 'U',
  'folders.data': 'D+H',
  'folders.resource': 'D+H',
  'fabric.loader': 'U',
  'fabric.api': 'U',
  'fabric.apiModrinth': 'U',
  'fabric.loom': 'U',
  'fabric.gradle': 'U',
  'fabric.minecraftDependency': 'H',
  'geckolib.dependency': 'U',
  'geckolib.fileName': 'U',
  'geckolib.modId': 'M',
  'geckolib.modrinthVersionId': 'U',
  'geckolib.sha512': 'U',
  'geckolib.url': 'U',
  'geckolib.version': 'U',
  'worldgen.biomeAttributes': 'D',
  'worldgen.featureSteps': 'D',
  'worldgen.environmentAttributes': 'D',
  'worldgen.dimensionHeight': 'D',
  'worldgen.noiseSettingsDefaultBlock': 'D',
  'worldgen.vanillaFeatureOrder': 'D',
  'worldgen.terrainPreview': 'H',
  'blocks.bedRules': 'H',
  'blocks.cauldrons': 'D+H',
  'blocks.containerSounds': 'H',
  'blocks.defaultTorchParticle': 'H',
  'blocks.dyeColours': 'H',
  'blocks.fluidModel': 'H',
  'blocks.fluidTags': 'D',
  'blocks.machineRecipeTypes': 'D+H',
  'blocks.modelTemplates': 'H',
  'blocks.plantSoils': 'D+H',
  'blocks.portal': 'H',
  'blocks.setTypes': 'H',
  'blocks.woodTypes': 'H',
  'blocks.soundModel': 'H',
  'blocks.soundSetEvents': 'H',
  'blocks.soundTypes': 'H',
  'blocks.stemTags': 'D+H',
  'blocks.vanillaPairs': 'H',
  'commands.argumentTypes': 'D+H',
  'commands.forms': 'H',
  'commands.fragments': 'H',
  'commands.vanillaNames': 'D',
  'controls.keyNames': 'H',
  'controls.keyboardNamesByCode': 'H',
  'controls.mouseNamesByCode': 'H',
  'controls.runtimeKeys': 'M',
  'controls.unboundKey': 'H',
  'controls.vanillaCombinations': 'H',
  'controls.vanillaKeys': 'H',
  'dataForms.consume_item_with_data': 'H',
  'dataForms.entity_is_type': 'H',
  'dataForms.player_head_of_this': 'H',
  'dataForms.player_killed_entity': 'H',
  'dev.gameRules': 'D+H',
  'dev.worldDataFolders': 'D',
  dyes: 'H',
  'entities.projectileItems': 'H',
  'entities.saddleTag': 'D',
  'entities.tradeSounds': 'H',
  'entities.vanillaJobSites': 'H',
  'entities.vanillaTradeSets': 'H',
  'entities.villagerTypes': 'D',
  'gameRules.categories': 'H',
  'gameRules.forGames': 'H',
  'gameRules.kinds': 'H',
  'gameRules.vanillaNames': 'D',
  'items.armorMaterials': 'H',
  'items.compostProviders': 'H',
  'items.dataPackComponents': 'D+H',
  'items.rangedPull': 'H',
  'items.vanillaTools': 'H',
  'particles.descriptionFolder': 'M',
  'particles.textureFolder': 'M',
  'particles.withOptions': 'D',
  'scoreboard.collisionRules': 'D',
  'scoreboard.criteria': 'H',
  'scoreboard.customStatCriteria': 'H',
  'scoreboard.deathMessageVisibility': 'D',
  'scoreboard.displaySlots': 'D',
  'scoreboard.nameTagVisibility': 'D',
  'scoreboard.numberFormats': 'D',
  'scoreboard.renderTypes': 'D',
  'scoreboard.statTypes': 'D',
  'scoreboard.teamColours': 'D',
  'scoreboard.teamCriteria': 'H',
  'stats.criterionPrefix': 'H',
  'stats.formats': 'H',
  'stats.vanillaCustomStats': 'D',
  'vehicles.maxSpeed': 'M',
  'vehicles.modes': 'M',
  'worlds.firstJoinCriterion': 'H',
  'worlds.fixedPlacementShape': 'H',
  'worlds.floatingIslandsSettings': 'H',
  'worlds.structurePlacements': 'H',
  'worlds.voidBiome': 'H',
};

/** Fact groups whose members are listed one by one (B810 V20 went two levels into these). */
const GROUPS = new Set([
  'worldgen',
  'blocks',
  'entities',
  'items',
  'commands',
  'fabric',
  'geckolib',
  'dev',
  'folders',
  'controls',
  'vehicles',
  'particles',
  'scoreboard',
  'gameRules',
  'worlds',
  'stats',
  'packFormats',
  'dataForms',
]);

/** Every fact path of a target's plain facts, one level deep and two in the groups. */
export function factPaths(facts: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(facts)) {
    if (GROUPS.has(key) && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const inner of Object.keys(value)) out.push(`${key}.${inner}`);
    } else out.push(key);
  }
  return out.sort();
}

/** One row of a `CHANGES.md` table. */
export interface ChangesRow {
  /** The heading the table is under. */
  section: string;
  /** The first cell: what the row is about. */
  fact: string;
  /** The last cell: where it was read. */
  source: string;
  /** Every `YYYY-MM-DD` in the row, in order. */
  dates: string[];
  /** The first date in the text above the table under the same heading ("Checked on ..."). */
  sectionDate?: string;
  /** The whole line, for searching. */
  text: string;
}

const DATE = /\b20\d\d-\d\d-\d\d\b/g;

/** The rows of every table in a `CHANGES.md` (header and separator lines left out). */
export function changesRows(markdown: string): ChangesRow[] {
  const lines = markdown.split(/\r?\n/);
  const rows: ChangesRow[] = [];
  let section = '';
  let sectionDate: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      section = (heading[1] as string).trim();
      sectionDate = undefined;
      continue;
    }
    if (!line.startsWith('|')) {
      sectionDate ??= line.match(DATE)?.[0];
      continue;
    }
    if (/^\|[\s:|-]+\|?\s*$/.test(line)) continue;
    if (/^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) continue;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((cell) => cell.trim());
    rows.push({
      section,
      fact: cells[0] ?? '',
      source: cells.length > 1 ? (cells.at(-1) as string) : '',
      dates: line.match(DATE) ?? [],
      ...(sectionDate === undefined ? {} : { sectionDate }),
      text: line,
    });
  }
  return rows;
}

/** A summary of the generated change set, for the header. */
export interface ChangeSetSummary {
  from: string;
  to: string;
  changes: number;
  manual: number;
  /** Registries and resources a change names, to flag rows whose data changed nearby. */
  subjects: string[];
}

export interface VerifyInput {
  mode: 'new' | 'repin';
  /** The target this file belongs to (`mc-<line>`) and the version it is pinned to now. */
  id: string;
  version: string;
  /** The target whose facts and `CHANGES.md` were the starting point, and its version. */
  base: { id: string; version: string };
  /** The target the change set runs from, when one was found. */
  previous?: string;
  date: string;
  /** The base target's `CHANGES.md`. */
  changesMd: string;
  facts: readonly FactComparison[];
  /** The base target's fact paths (`factPaths`). */
  paths: readonly string[];
  upstream: UpstreamDraft;
  /** Facts `make.ts` set in `target.ts`, and the ones it could not. */
  applied: readonly string[];
  notApplied: readonly string[];
  changeSet?: ChangeSetSummary;
  /** The test files of the target folder (`test/*.test.ts`). */
  tests: readonly string[];
  /** The repository's sample projects (`fixtures/sample-*`) and parity fixtures (`*-parity`). */
  fixtures: readonly string[];
}

const code = (text: string): string => `\`${text.replaceAll('`', "'")}\``;
const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

function draftRow(name: string, d: DraftValue): string {
  const value =
    d.value === undefined ? `not read (${cell(d.problem ?? 'no value')})` : code(d.value);
  return `| ${code(name)} | ${value} (verify at implementation) | ${cell(d.source)} |`;
}

/** The text of `VERIFY.md`. */
export function verifyText(input: VerifyInput): string {
  const line = releaseLine(input.version);
  const pkg = `@msm/target-${input.id}`;
  const folder = `packages/targets/${input.id}`;
  const rows = changesRows(input.changesMd);
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  push(
    `# Verify ${input.id} (${input.version})`,
    '',
    input.mode === 'new'
      ? `Made by \`tools/new-target\` on ${input.date} from ${code(input.base.id)} (${input.base.version}). Every fact in \`src/target.ts\` but the identity facts below is still ${input.base.id}'s value: nothing here is verified for ${input.version} until a person has worked through this list.`
      : `Re-pinned by \`tools/new-target\` on ${input.date} from ${input.base.version} to ${input.version}. Only the vendored data, the generated change set and the drafts changed; \`src/target.ts\` still holds the facts of ${input.base.version}.`,
    '',
    'Work through each list. Record every value read again in `CHANGES.md` with its date and source, mark it "(verify at implementation)" where it could not be read, and delete this file when nothing is left (ADR 0136 D11).',
    '',
  );

  if (input.changeSet !== undefined) {
    push(
      `The generated change set (\`src/changes/generated.json\`, words in \`CHANGES-draft.md\`) runs from ${code(input.changeSet.from)} to ${code(input.changeSet.to)}: ${input.changeSet.changes} changes, ${input.changeSet.manual} of them needing a person. Confirm renames, and write sentences, hints and in-game checks, in the curated change file; never edit the generated one.`,
      '',
    );
  } else {
    push(
      'No change set was generated: the target names no `previous` target whose folder exists.',
      '',
    );
  }

  push(
    '## 1. Derived facts, recomputed from the vendored data',
    '',
    input.mode === 'new'
      ? `Set in \`src/target.ts\` by the tool: ${input.applied.length === 0 ? 'none' : input.applied.map(code).join(', ')}. Carry every other "changed" row across by hand${input.notApplied.length === 0 ? '' : `, and these, which the tool could not find in the file: ${input.notApplied.map(code).join(', ')}`}.`
      : 'Carry every "changed" row into `src/target.ts` by hand (a re-pin does not touch it); the target tests tie most of them to the vendored data.',
    '',
    `| Fact | ${input.base.id} today | From the new data | State |`,
    '|---|---|---|---|',
  );
  for (const f of input.facts) {
    const delta = f.state === 'changed' ? listDelta(f.before, f.after) : undefined;
    const state =
      f.state === 'not-derived'
        ? 'could not be derived: check by its test'
        : f.state === 'changed'
          ? `**changed**${delta ? `: ${delta}` : ''}`
          : 'same';
    push(`| ${code(f.fact)} | ${showValue(f.before)} | ${showValue(f.after)} | ${cell(state)} |`);
  }
  const derivedHere = new Set(input.facts.map((f) => f.fact));
  const otherDerived = input.paths.filter((p) => FACT_CLASSES[p] === 'D' && !derivedHere.has(p));
  if (otherDerived.length > 0) {
    push(
      '',
      `Derived from data but not recomputed here; their target tests derive them again: ${otherDerived.map(code).join(', ')}.`,
    );
  }

  push(
    '',
    '## 2. Facts from upstream services (drafts)',
    '',
    `Drafted values are also in \`drafts/engine-mod.properties\`; copy that file to \`engine-mod/versions/${line}.properties\` once each value is checked.`,
    '',
    '| Fact | Draft | Source |',
    '|---|---|---|',
    draftRow('fabric.loader', input.upstream.loader),
    draftRow('fabric.api', input.upstream.api),
    draftRow('fabric.loom', input.upstream.loom),
    draftRow('java', input.upstream.java),
    draftRow('fabric.minecraftDependency', input.upstream.minecraftDependency),
    '',
    `- [ ] \`fabric.apiModrinth\`: the Modrinth version of that Fabric API build (version id, file name, URL, SHA-1, SHA-512 equal to the Fabric Maven \`.sha512\`, size).`,
    '- [ ] `fabric.gradle`: equal to `engine-mod/gradle/wrapper/gradle-wrapper.properties`.',
    '- [ ] `geckolib`: whether Modrinth lists a GeckoLib build for this version (never for a test version); set the fact, or leave it out so `renderer: geckolib` mobs report `export.no-geckolib-target`.',
    '',
  );

  push(
    `## 3. Hand-verified facts to read again (every row of ${input.base.id}'s \`CHANGES.md\`)`,
    '',
    'Each row as it was last recorded: what it is about, when it was read and from where. Read each again on this version (javap over the Loom-cached jar, a server or client run, the dumps) and record the new date and source.',
    '',
  );
  const subjects = input.changeSet?.subjects ?? [];
  let section: string | undefined;
  for (const row of rows) {
    if (row.section !== section) {
      section = row.section;
      push('', `### ${section === '' ? 'Rows' : section}`, '');
    }
    const near = subjects.filter((s) => row.text.includes(`\`${s}\``));
    const when =
      row.dates.length > 0
        ? `last read ${row.dates.at(-1)}`
        : row.sectionDate !== undefined
          ? `no date of its own (the section says ${row.sectionDate})`
          : 'no date recorded';
    push(
      `- [ ] ${row.fact}: ${when}. Source: ${row.source === '' ? '(none)' : row.source}${near.length === 0 ? '' : ` **Data near it changed:** ${near.map(code).join(', ')}.`}`,
    );
  }
  const handPaths = input.paths.filter((p) => {
    const kind = FACT_CLASSES[p];
    return kind === 'H' || kind === 'D+H';
  });
  const unnamed = handPaths.filter((p) => {
    const name = p.split('.').at(-1) as string;
    return !rows.some((r) => r.text.includes(`\`${p}\``) || r.text.includes(`\`${name}\``));
  });
  if (unnamed.length > 0) {
    push(
      '',
      '### Hand-verified facts no row names',
      '',
      ...unnamed.map(
        (p) => `- [ ] ${code(p)} (${FACT_CLASSES[p]}): find where it was read and add a row.`,
      ),
    );
  }
  const unclassified = input.paths.filter((p) => FACT_CLASSES[p] === undefined);
  if (unclassified.length > 0) {
    push(
      '',
      '### Facts not classified',
      '',
      "Not in the tool's table of fact kinds (`FACT_CLASSES` in `tools/new-target/verify.ts`): decide whether each is derived, from upstream, read by hand or MSM's own, add it there, and check it.",
      '',
      ...unclassified.map((p) => `- [ ] ${code(p)}`),
    );
  }

  push(
    '',
    '## 4. Tests, goldens, GameTests and parity fixtures to rerun',
    '',
    `- [ ] \`pnpm --filter ${pkg} test\`: ${input.tests.length === 0 ? 'no test files' : input.tests.map(code).join(', ')}. They still assert ${input.base.version}'s values where those were typed into them: update each with the fact.`,
    '- [ ] `pnpm --filter @msm/targets test` (the chain of `previous`, the client jar tests with the Loom-cached jar of this version).',
    input.previous === undefined
      ? '- [ ] `tools/diff-targets` once `previous` is set.'
      : `- [ ] \`node tools/diff-targets/index.ts --from packages/targets/${input.previous} --to ${folder} --out ${folder}/src/changes/generated.json --draft ${folder}/CHANGES-draft.md --check\``,
    '- [ ] `UPDATE_GOLDENS=1` for the plugin and exporter goldens of this target, each difference read: `pnpm --filter "@msm/plugin-*" test`, `pnpm --filter @msm/exporters test` (its library test exports every mirror project on every target).',
    '- [ ] The `examples/` mirror (`UPDATE_GOLDENS=1` in `@msm/plugin-library`) and `node tools/check-project/index.ts examples/... --target ' +
      `${input.id}\`.`,
    `- [ ] \`cd engine-mod && ./gradlew build -Pmc=${line}\` (the runtime's GameTests) and \`./gradlew -p parity build\`.`,
    `- [ ] \`node tools/run-fabric-server/index.ts\` with the runtime jar of ${line}: the server checks and the parity GameTests on the samples' content and ejected jars.`,
    ...input.fixtures.map((f) =>
      f.endsWith('-parity')
        ? `- [ ] ${code(`fixtures/${f}`)}: measured on the real game again.`
        : `- [ ] ${code(`fixtures/${f}`)}: its parity GameTests and in-game checks.`,
    ),
    '- [ ] `pnpm lint`, `pnpm typecheck`, `node tools/check-deps/index.ts`.',
    '',
  );

  push(
    '## 5. Manual work, by design (ADR 0136 D11)',
    '',
    "- [ ] Behaviour that changed in the game's code and not in its data: read the release notes; every change that touches a kind gets a curated sentence and an in-game check.",
    `- [ ] The runtime port: \`engine-mod/src/mc/${line}/\` seams, Mixins and Fabric API changes; its GameTests and the parity fixtures.`,
    "- [ ] The Java project generator (`javaProject`, `loadJavaProject`): whether the previous generator's Java compiles here.",
    "- [ ] Try it's and the terrain preview's agreement with the real game (`worldgen.terrainPreview.approximate`).",
    '- [ ] GeckoLib and Fabric Loader availability for this version.',
    '- [ ] Every fact read with `javap` or measured on a server or client (section 3).',
    '- [ ] The curated change file: confirm each rename candidate (and prove its shape), write the sentences, hints and in-game checks.',
  );
  if (input.mode === 'new') {
    push(
      '',
      '### Wiring a new target',
      '',
      `- [ ] \`pnpm i\` (the workspace already takes \`packages/targets/*\`), then the root \`tsconfig.json\` and \`tools/tsconfig.json\` references.`,
      `- [ ] \`packages/targets/all\`: the dependency on \`${pkg}\` and the entry in \`builtInTargets\`; its tests.`,
      "- [ ] `previous`, `changes` and `migrateFrom`: the tool set `previous` and removed the previous step's migration; wire the shared migration engine over `src/changes/` (generated and curated) as the previous target does.",
      `- [ ] \`engine-mod/versions/${line}.properties\` from \`drafts/engine-mod.properties\`; \`tools/check-deps\` (version pattern, Gradle facts) and the CI matrix.`,
      '- [ ] The header comment and every "Verified" comment in `src/target.ts`, `CHANGES.md` row by row.',
    );
  }
  push('');
  return out.join('\n');
}
