/**
 * Upgrade notes for an ejected Java project (ADR 0136 D8, brief B822): `fixtures/sample-mod`
 * ejected for the oldest target that can eject, then read (only read) for a move to the target
 * after it. The notes name the Fabric API and Minecraft lines from both targets' facts, say from
 * the newer target's facts whether MCSuperMods can eject there, and find planted removed ids
 * with their lines; the folder's hash is the same before and after.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ElementKindRegistry, registerPlugin } from '@msm/core';
import type { Plugin, TargetChangeSet, TargetFacts } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin from '@msm/plugin-worldgen';
import { builtInTargets } from '@msm/targets';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildLineNotes,
  foundChanges,
  isJavaSourcePath,
  isUpgradeScanPath,
  type JavaProjectScan,
  jsonValueLines,
  upgradeNotes,
  upgradeNotesMarkdown,
  versionFactChanges,
} from '../src/index';
import { exportJavaProject, repoRoot, STUB_WRAPPER, writeTree } from './sample-java';

const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const older = builtInTargets.find((bundle) => bundle.target.loadJavaProject !== undefined);
const newer = builtInTargets.find((bundle) => bundle.target.previous === older?.target.id);

/** Every file of `root` with its bytes, by `/` path. */
async function readAll(root: string, at = ''): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  for (const entry of await readdir(join(root, at), { withFileTypes: true })) {
    const path = at === '' ? entry.name : `${at}/${entry.name}`;
    if (entry.isDirectory()) for (const [p, b] of await readAll(root, path)) out.set(p, b);
    else out.set(path, await readFile(join(root, path)));
  }
  return out;
}

function hashOf(files: Map<string, Buffer>): string {
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    hash.update(`${path}\0`);
    hash.update(files.get(path) as Buffer);
  }
  return hash.digest('hex');
}

/** The test's stand-in for the app's read-only scan. */
async function scan(root: string): Promise<JavaProjectScan> {
  const all = await readAll(root);
  const paths = [...all.keys()].sort();
  return {
    folder: root,
    files: paths
      .filter(isUpgradeScanPath)
      .map((path) => ({ path, text: (all.get(path) as Buffer).toString('utf8') })),
    javaFiles: paths.filter(isJavaSourcePath).length,
  };
}

const folders: string[] = [];
afterAll(async () => {
  for (const folder of folders) await rm(folder, { recursive: true, force: true });
});

describe.runIf(older !== undefined && newer !== undefined)('upgrade notes for sample-mod', () => {
  it('names the build lines from facts, the eject, and a planted removed id with its line', async () => {
    const from = (older as NonNullable<typeof older>).target;
    const to = (newer as NonNullable<typeof newer>).target;
    const changes = to.changes as TargetChangeSet;
    expect(changes).toBeDefined();
    const { files, ok } = await exportJavaProject({
      root: join(repoRoot, 'fixtures', 'sample-mod'),
      registry,
      bundle: older as NonNullable<typeof older>,
      meta: { msmVersion: '0.6.0', plugins: ['msm.blocks-items', 'msm.datapack'] },
      wrapper: STUB_WRAPPER,
    });
    expect(ok).toBe(true);
    const folder = await mkdtemp(join(tmpdir(), 'msm-b822-'));
    folders.push(folder);
    await writeTree(files, folder);

    // Plant a removed id (whole string) and one inside a function line, from the change set.
    const removed = changes.changes.filter(
      (change) =>
        change.area === 'ids' &&
        change.what === 'member-removed' &&
        change.registry !== undefined &&
        !change.registry.startsWith('tag/') &&
        (change.stillIn ?? []).length === 0,
    );
    const [first, second] = removed;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const memberOf = (change: NonNullable<typeof first>) =>
      change.subject.slice((change.registry as string).length + 1);
    const namespace = 'b822_planted';
    const dataPath = `src/main/resources/data/${namespace}/tags/planted/b822.json`;
    const functionPath = `src/main/resources/data/${namespace}/function/b822.mcfunction`;
    await mkdir(join(folder, 'src/main/resources/data', namespace, 'tags/planted'), {
      recursive: true,
    });
    await mkdir(join(folder, 'src/main/resources/data', namespace, 'function'), {
      recursive: true,
    });
    await writeFile(
      join(folder, ...dataPath.split('/')),
      `${JSON.stringify({ values: ['minecraft:stone', `minecraft:${memberOf(first as never)}`] }, null, 2)}\n`,
    );
    await writeFile(
      join(folder, ...functionPath.split('/')),
      `say hello\nsay minecraft:${memberOf(second as never)} is here\n`,
    );

    const before = hashOf(await readAll(folder));
    const scanned = await scan(folder);
    const canEject = to.javaProject !== undefined || to.loadJavaProject !== undefined;
    const notes = upgradeNotes({
      scan: scanned,
      from,
      to,
      canEject,
      changeSets: [changes],
      javaEdited: 'no',
    });
    const markdown = upgradeNotesMarkdown(notes);
    expect(hashOf(await readAll(folder))).toBe(before);

    // The Minecraft and Fabric API lines, as they are and as they become, from facts.
    const fabricFrom = from.fabric as NonNullable<TargetFacts['fabric']>;
    const fabricTo = to.fabric as NonNullable<TargetFacts['fabric']>;
    expect(notes.buildLines).toContainEqual(
      expect.objectContaining({
        file: 'gradle.properties',
        now: `minecraft_version=${from.mcVersion}`,
        next: `minecraft_version=${to.mcVersion}`,
      }),
    );
    expect(notes.buildLines).toContainEqual(
      expect.objectContaining({
        file: 'gradle.properties',
        now: `fabric_api_version=${fabricFrom.api}`,
        next: `fabric_api_version=${fabricTo.api}`,
      }),
    );
    expect(
      notes.buildLines.some((note) => note.file === 'src/main/resources/fabric.mod.json'),
    ).toBe(true);
    expect(markdown).toContain(`fabric_api_version=${fabricTo.api}`);
    expect(markdown).toContain(`minecraft_version=${to.mcVersion}`);

    // Whether MCSuperMods can eject there, from the newer target.
    expect(notes.advice).toBe(canEject ? 'eject-again' : 'by-hand');
    if (!canEject) {
      expect(markdown).toContain(
        `MCSuperMods cannot export a Java project for Minecraft ${to.mcVersion} yet`,
      );
    }

    // The planted ids, with their lines.
    expect(notes.found).toContainEqual(
      expect.objectContaining({
        file: dataPath,
        line: 4,
        written: `minecraft:${memberOf(first as never)}`,
        changeId: (first as NonNullable<typeof first>).id,
      }),
    );
    expect(notes.found).toContainEqual(
      expect.objectContaining({
        file: functionPath,
        line: 2,
        written: `minecraft:${memberOf(second as never)}`,
      }),
    );
    expect(markdown).toContain(`\`${dataPath}\` line 4`);
    expect(markdown).toContain(`\`${functionPath}\` line 2`);
    expect(notes.javaFiles).toBeGreaterThan(0);
    expect(markdown).toContain("Minecraft's own Java");
  });
});

describe('upgrade notes, parts', () => {
  const from = {
    mcVersion: '1.0',
    java: 21,
    fabric: {
      loader: '0.1.0',
      loom: '1.0.0',
      api: '0.10.0+1.0',
      minecraftDependency: '~1.0',
      gradle: '8.0',
    },
    geckolib: { version: '4.0', modrinthVersionId: 'abc' },
  } as unknown as TargetFacts;
  const to = {
    mcVersion: '1.1',
    java: 22,
    fabric: {
      loader: '0.2.0',
      loom: '1.0.0',
      api: '0.11.0+1.1',
      minecraftDependency: '~1.1',
      gradle: '8.1',
    },
  } as unknown as TargetFacts;

  it('lists the facts that change, GeckoLib with none', () => {
    const facts = versionFactChanges(from, to);
    expect(facts.map((fact) => fact.label)).toEqual([
      'Minecraft',
      'Fabric Loader',
      'Fabric API',
      'the Minecraft versions the mod accepts',
      'Gradle',
      'Java',
      'GeckoLib (Modrinth version)',
      'GeckoLib',
    ]);
    expect(facts.find((fact) => fact.label === 'GeckoLib')?.to).toBeUndefined();
  });

  it('rewrites whole versions only, the longest first', () => {
    const facts = versionFactChanges(from, to);
    const notes = buildLineNotes(
      [
        {
          path: 'gradle.properties',
          text: 'minecraft_version=1.0\nfabric_api_version=0.10.0+1.0\nother=11.0\ngeckolib_modrinth_version_id=abc\n',
        },
        { path: 'build.gradle.kts', text: '    options.release = 21\n    x = VERSION_210\n' },
      ],
      facts,
    );
    expect(notes).toEqual([
      {
        file: 'gradle.properties',
        line: 1,
        now: 'minecraft_version=1.0',
        next: 'minecraft_version=1.1',
        facts: ['Minecraft'],
      },
      {
        file: 'gradle.properties',
        line: 2,
        now: 'fabric_api_version=0.10.0+1.0',
        next: 'fabric_api_version=0.11.0+1.1',
        facts: ['Fabric API'],
      },
      {
        file: 'gradle.properties',
        line: 4,
        now: 'geckolib_modrinth_version_id=abc',
        next: undefined,
        facts: ['GeckoLib (Modrinth version)'],
      },
      {
        file: 'build.gradle.kts',
        line: 1,
        now: '    options.release = 21',
        next: '    options.release = 22',
        facts: ['Java'],
      },
    ]);
  });

  it('maps JSON pointers to lines', () => {
    const lines = jsonValueLines('{\n  "a": [\n    1,\n    "x/y"\n  ],\n  "b~/": {"c": true}\n}');
    expect(lines?.get('/a/1')).toBe(4);
    expect(lines?.get('/b~0~1/c')).toBe(6);
    expect(jsonValueLines('{ "a": }')).toBeNull();
  });

  it('finds whole ids, tag ids, ids in text and removed commands; skips language files', () => {
    const set: TargetChangeSet = {
      from: 'mc-a',
      to: 'mc-b',
      changes: [
        {
          id: 'ids:fluid/old_fluid',
          area: 'ids',
          what: 'member-removed',
          registry: 'fluid',
          subject: 'fluid/old_fluid',
          from: 'old_fluid',
          handling: 'manual',
          source: 'registries',
          hint: 'Use another fluid.',
        },
        {
          id: 'ids:tag/item/old_tag',
          area: 'ids',
          what: 'member-removed',
          registry: 'tag/item',
          subject: 'tag/item/old_tag',
          from: 'old_tag',
          to: ['new_tag'],
          handling: 'manual',
          source: 'registries',
        },
        {
          id: 'commands:oldcmd',
          area: 'commands',
          what: 'root-removed',
          subject: 'oldcmd',
          handling: 'manual',
          source: 'commands',
        },
      ],
    } as unknown as TargetChangeSet;
    const { found, unreadable } = foundChanges(
      [
        {
          path: 'src/main/resources/data/m/recipe/r.json',
          text: '{\n  "x": "minecraft:old_fluid",\n  "t": "#minecraft:old_tag"\n}',
        },
        {
          path: 'src/main/resources/data/m/function/f.mcfunction',
          text: 'oldcmd go\nsay #minecraft:old_tag.\n',
        },
        {
          path: 'src/main/resources/assets/m/lang/en_us.json',
          text: '{"k": "minecraft:old_fluid"}',
        },
        { path: 'src/main/resources/data/m/recipe/bad.json', text: '{ nope' },
      ],
      [set],
      '9.9',
    );
    expect(unreadable).toEqual(['src/main/resources/data/m/recipe/bad.json']);
    expect(
      found.map((note) => [note.file.split('/').pop(), note.line, note.changeId, note.written]),
    ).toEqual([
      ['f.mcfunction', 1, 'commands:oldcmd', undefined],
      ['f.mcfunction', 2, 'ids:tag/item/old_tag', '#minecraft:old_tag'],
      ['r.json', 2, 'ids:fluid/old_fluid', 'minecraft:old_fluid'],
      ['r.json', 3, 'ids:tag/item/old_tag', '#minecraft:old_tag'],
    ]);
    expect(found[0]?.sentence).toBe('Minecraft 9.9 no longer has the command "oldcmd".');
    expect(found[1]?.to).toEqual(['new_tag']);
    expect(found[2]?.hint).toBe('Use another fluid.');
  });

  it('advises by the eject fact and the answer about hand edits', () => {
    const scanned: JavaProjectScan = { folder: '/x/my_mod', files: [], javaFiles: 1 };
    const advice = (canEject: boolean, javaEdited: 'yes' | 'no' | 'unknown') =>
      upgradeNotes({ scan: scanned, from, to, canEject, changeSets: [], javaEdited }).advice;
    expect(advice(false, 'no')).toBe('by-hand');
    expect(advice(true, 'no')).toBe('eject-again');
    expect(advice(true, 'yes')).toBe('edited');
    expect(advice(true, 'unknown')).toBe('eject-again-if-not-edited');
    const markdown = upgradeNotesMarkdown(
      upgradeNotes({
        scan: scanned,
        from,
        to,
        canEject: true,
        changeSets: [],
        javaEdited: 'unknown',
      }),
    );
    expect(markdown).toContain('# Upgrade notes: my_mod, from Minecraft 1.0 to 1.1');
    expect(markdown).toContain('does not look like a Java project MCSuperMods exported');
    expect(markdown).toContain('1 Java file uses');
  });
});
