/**
 * Builds the community repository's `examples/` folder from MSM's `examples/` mirror: each
 * mirror project (a folder holding `msm.project.json`) becomes a folder of the same path with
 * its project files, a `picture.png` and a `README.md` made from the library entry it mirrors
 * (title, description, category and target), and `examples/README.md` indexes them all. The
 * result is a map of paths to bytes, so writing it and checking it share one source.
 *
 * @packageDocumentation
 */

import type { ExampleProject, ProjectStarter } from '@msm/plugin-api';
import {
  behaviourExamples,
  entityBehaviourExamples,
  gameExamples,
  kindExamples,
  libraryStarters,
  popularExamples,
  popularFolder,
  rulesBehaviourExamples,
  rulesKindExamples,
  scriptBehaviourExamples,
  worldExamples,
} from '@msm/plugin-library';
import { builtInTargets, targetById } from '@msm/targets';
import { examplePicture } from './picture.ts';

/** One file of a folder, by its POSIX path relative to the folder. */
export interface TreeFile {
  path: string;
  bytes: Uint8Array;
}

/** What the README of one community example says about it. */
export interface ExampleInfo {
  /** The folder under `examples/`, for example `popular/glowshard`. */
  folder: string;
  title: string;
  description: string;
  /** The gallery group, for example `Popular ideas`. */
  category: string;
  /** For a project that holds several library examples, each one's title and description. */
  members: { title: string; description: string }[];
  /** The project's own target id. */
  targetId: string;
  /** That target's Minecraft version. */
  mcVersion: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The folder of the community repository the examples go in. */
export const EXAMPLES_DIR = 'examples';

/** The project files a community example keeps from its mirror folder. */
const isProjectFile = (path: string): boolean =>
  path === 'msm.project.json' || path.startsWith('content/') || path.startsWith('assets/');

const member = (entry: ExampleProject | ProjectStarter) => ({
  title: entry.title,
  description: entry.description,
});

/** The mirror projects that hold several library examples (as `library.test.ts` builds them). */
const GROUPS: Readonly<
  Record<string, { category: string; description: string; members: () => ExampleProject[] }>
> = {
  'all-kinds': {
    category: 'Every kind',
    description:
      'One commented example of every kind of thing MSM makes, in one project: open it to see how each kind is filled in.',
    members: () => [...kindExamples],
  },
  'blocks-items': {
    category: 'Blocks and items',
    description:
      'Blocks and items that do something: tools with recipes, event chains, fuel, effects while worn, potions, particles, portals and the vanilla-style furniture, plants and copper.',
    members: () => [...behaviourExamples],
  },
  entities: {
    category: 'Mobs',
    description:
      'Mobs with their own models, animations, skins and spawn eggs: one that attacks players and one that spawns in the wild.',
    members: () => [...entityBehaviourExamples],
  },
  scripts: {
    category: 'Scripts',
    description:
      'What scripts can do: scheduled effects, action handlers, scripted effects, counters kept across restarts, set bonuses, teleporting, boss bars and commands.',
    members: () => [...scriptBehaviourExamples],
  },
  rules: {
    category: 'Rules',
    description:
      'Rules made without code: a lucky block that rewards or punishes, and a guard mob that warns players who come close.',
    members: () => [...rulesKindExamples, ...rulesBehaviourExamples],
  },
};

const WORLD_PREFIX = 'example_world_';

/**
 * The library entry a mirror folder holds, as the README describes it.
 *
 * @throws Error For a folder no library entry matches (the mirror gained a new kind of folder
 *   this tool does not know yet).
 */
export function exampleInfo(
  folder: string,
  project: { name?: unknown; targets?: unknown },
): ExampleInfo {
  const listed = Array.isArray(project.targets) ? project.targets[0] : undefined;
  const targetId = typeof listed === 'string' ? listed : '';
  const bundle = targetById(targetId);
  if (bundle === undefined) {
    throw new Error(
      `examples/${folder}: the project's target ${JSON.stringify(targetId)} is not built in.`,
    );
  }
  const base = { folder, targetId, mcVersion: bundle.target.mcVersion };
  const group = GROUPS[folder];
  if (group !== undefined) {
    return {
      ...base,
      title: typeof project.name === 'string' ? project.name : folder,
      description: group.description,
      category: group.category,
      members: group.members().map(member),
    };
  }
  const [section, name] = folder.split('/');
  let entry: ExampleProject | ProjectStarter | undefined;
  let category = '';
  if (section === 'popular') {
    entry = popularExamples.find((example) => popularFolder(example) === name);
    category = entry?.category ?? '';
  } else if (section === 'worlds') {
    entry = worldExamples.find((example) => example.id === `${WORLD_PREFIX}${name}`);
    category = entry?.category ?? '';
  } else if (section === 'games') {
    entry = gameExamples.find((example) => example.id === `example_game_${name}`);
    category = entry?.category ?? '';
  } else if (section === 'starters') {
    entry = libraryStarters.find((starter) => starter.id === name);
    category = 'Starters';
  }
  if (entry === undefined) {
    throw new Error(
      `examples/${folder}: no library example or starter matches this folder; teach tools/community-repo/examples.ts about it.`,
    );
  }
  return { ...base, title: entry.title, description: entry.description, category, members: [] };
}

/** Whether a folder is a world or worldgen project (for its drawn placeholder picture). */
function isWorld(folder: string): boolean {
  return /^worlds\/|world|biome|jigsaw|dimension/.test(folder);
}

/** The README of one community example. */
export function exampleReadme(info: ExampleInfo): string {
  const others = builtInTargets
    .map((bundle) => bundle.target)
    .filter((target) => target.id !== info.targetId)
    .map((target) => `${target.id} (Minecraft ${target.mcVersion})`);
  const lines = [
    `# ${info.title}`,
    '',
    '![Picture](picture.png)',
    '',
    info.description,
    '',
    `- **Category:** ${info.category}`,
    `- **Made for:** Minecraft ${info.mcVersion} (MSM target \`${info.targetId}\`)`,
    '- **Made by:** the MCSuperMods library (an example that ships with the app)',
    '- **Licence:** MIT, like MCSuperMods',
    '',
  ];
  if (info.members.length > 0) {
    lines.push(`## What is in it (${info.members.length} examples)`, '');
    for (const entry of info.members) lines.push(`- **${entry.title}:** ${entry.description}`);
    lines.push('');
  }
  lines.push(
    '## How to open it',
    '',
    '1. Download this folder (or the whole repository as a zip from the green **Code** button).',
    '2. In MCSuperMods, choose **File > Open Project…** and pick this folder (the one with `msm.project.json` in it).',
    '3. Look around, change things, then use **Play** or **Export** to try it in the game.',
    '',
  );
  if (others.length > 0) {
    lines.push(
      `For another Minecraft version, use **File > Upgrade Project Target…** in MCSuperMods. The checks of this repository open the example on ${others.join(', ')} that way too.`,
      '',
    );
  }
  lines.push(
    'This folder is made from the MCSuperMods `examples/` folder by `tools/community-repo/sync.ts`; change the example there, not here.',
    '',
  );
  return lines.join('\n');
}

/** The index of every community example, grouped by category. */
export function examplesIndex(infos: readonly ExampleInfo[]): string {
  const categories = new Map<string, ExampleInfo[]>();
  for (const info of infos) {
    const list = categories.get(info.category) ?? [];
    list.push(info);
    categories.set(info.category, list);
  }
  const lines = [
    '# Examples',
    '',
    `The ${infos.length} example projects that ship with MCSuperMods, each a folder you can open in the app (**File > Open Project…**). Each folder has a README with a picture, what the example shows and how to open it.`,
    '',
    'These folders are made from the MCSuperMods `examples/` folder by `tools/community-repo/sync.ts`; do not change them by hand. Share your own mods in [`mods/`](../mods/).',
    '',
  ];
  for (const [category, list] of [...categories].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    lines.push(`## ${category}`, '', '| Example | What it shows | Minecraft |', '|---|---|---|');
    for (const info of [...list].sort((a, b) => (a.folder < b.folder ? -1 : 1))) {
      const description = info.description.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
      lines.push(`| [${info.title}](${info.folder}/) | ${description} | ${info.mcVersion} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * The community repository's `examples/` folder made from the mirror's files: every path
 * relative to the community repository (`examples/...`), sorted, and the infos written.
 *
 * @param mirror - Every file of MSM's `examples/` folder, by path relative to it.
 */
export function buildExamples(mirror: readonly TreeFile[]): {
  files: TreeFile[];
  infos: ExampleInfo[];
} {
  const projectFolders = mirror
    .filter((file) => file.path.endsWith('/msm.project.json') || file.path === 'msm.project.json')
    .map((file) => file.path.slice(0, -'/msm.project.json'.length))
    .sort();
  const files: TreeFile[] = [];
  const infos: ExampleInfo[] = [];
  for (const folder of projectFolders) {
    const prefix = `${folder}/`;
    const own = mirror.filter(
      (file) => file.path.startsWith(prefix) && isProjectFile(file.path.slice(prefix.length)),
    );
    const header = JSON.parse(
      decoder.decode(own.find((file) => file.path === `${prefix}msm.project.json`)?.bytes),
    ) as { name?: unknown; targets?: unknown };
    const info = exampleInfo(folder, header);
    infos.push(info);
    const pngs = new Map(
      own
        .filter((file) => file.path.toLowerCase().endsWith('.png'))
        .map((file) => [file.path.slice(prefix.length), file.bytes] as const),
    );
    for (const file of own) files.push({ path: `${EXAMPLES_DIR}/${file.path}`, bytes: file.bytes });
    files.push({
      path: `${EXAMPLES_DIR}/${prefix}picture.png`,
      bytes: examplePicture(pngs, isWorld(folder)),
    });
    files.push({
      path: `${EXAMPLES_DIR}/${prefix}README.md`,
      bytes: encoder.encode(exampleReadme(info)),
    });
  }
  files.push({ path: `${EXAMPLES_DIR}/README.md`, bytes: encoder.encode(examplesIndex(infos)) });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, infos };
}
