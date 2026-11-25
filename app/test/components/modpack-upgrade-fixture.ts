/**
 * Shared stand-ins for B821's modpack tests: three pinned mods, Modrinth's recorded answer for an
 * invented newer version (one new build, one none, one pin that already fits) and a pack holding
 * the project. No network.
 */
import type { Modpack, ModpackMod } from '@msm/core';
import type { ModpackView, ModrinthModUpdate } from '../../src/shared/platform';

export const mod = (title: string, digit: string, projectId: string): ModpackMod => ({
  projectId,
  versionId: `OLD${projectId.slice(0, 5)}`,
  title,
  fileName: `${title.toLowerCase()}-old.jar`,
  url: `https://cdn.modrinth.com/data/${projectId}/old.jar`,
  sha1: digit.repeat(40),
  sha512: digit.repeat(128),
  size: 10,
});

export const lumen = mod('Lumen', '1', 'LUMEN001');
export const golem = mod('Golemkit', '2', 'GOLEM001');
export const steady = mod('Steady', '5', 'STEADY01');

/** Modrinth's recorded answer for 99.2: Lumen has a new build, Steady's pin already fits. */
export const answer: ModrinthModUpdate[] = [
  {
    from: lumen.sha1,
    versionNumber: '2.0.0+99.2',
    file: {
      projectId: lumen.projectId,
      versionId: 'NEWLUMEN',
      fileName: 'lumen-new.jar',
      url: 'https://cdn.modrinth.com/data/LUMEN001/new.jar',
      sha1: '3'.repeat(40),
      sha512: '3'.repeat(128),
      size: 11,
    },
  },
  {
    from: steady.sha1,
    versionNumber: '1.0.0',
    file: {
      projectId: steady.projectId,
      versionId: steady.versionId,
      fileName: steady.fileName,
      url: steady.url,
      sha1: steady.sha1,
      sha512: steady.sha512,
      size: steady.size,
    },
  },
];

export function packView(over: Partial<Modpack> = {}, others: ModpackView['members'] = []) {
  const modpack: Modpack = {
    formatVersion: 1,
    name: 'Bright Pack',
    version: '1.0.0',
    targetId: 'mc-99.1',
    projects: [{ path: '../my_mod' }],
    mods: [lumen, golem],
    ...over,
  };
  const view: ModpackView = {
    root: '/home/me/packs/bright',
    modpack,
    members: [
      {
        path: '../my_mod',
        root: '/home/me/packs/my_mod',
        found: true,
        name: 'My Mod',
        targetId: 'mc-99.1',
      },
      ...others,
    ],
  };
  return view;
}

export const PROJECT = '/home/me/packs/my_mod';
