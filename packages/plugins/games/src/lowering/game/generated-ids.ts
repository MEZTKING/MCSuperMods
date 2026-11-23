/**
 * The ids a game's round engine and a kit write (B724), for `gamesGeneratedIds` (the app's
 * registry view and the mcfunction checker). The round engine's files depend on the game's data
 * in many small ways, so rather than repeat its choices this lowers the game once with a stand-in
 * target whose folders are the data pack's own names and whose forms keep only what names an id:
 * `tag <entities> add <tag>` and `scoreboard objectives add`, every other form giving back the
 * command it runs (`[command]`) or nothing. The ids are read from the files' paths and those
 * lines, as the test reads the real lowering's. The mechanics' own files (B725, B726) are not
 * part of it.
 */
import type { Element, OutputFile, TargetFacts } from '@msm/plugin-api';
import { lowerKit } from '../kit';
import { GAMES_FUNCTION_ROOT, splitId } from '../shared-functions';
import { lobbyFiles } from './lobby';
import { rolesFiles } from './roles';
import { roundFiles } from './round';

/** The forms the stand-in target keeps whole: the lines an id category is read from. */
const KEPT_FORMS: Readonly<Record<string, string>> = Object.freeze({
  tag_add: 'tag <entities> add <tag>',
  objective_add: 'scoreboard objectives add <objective> <criterion>',
});

/** A stand-in target that lowers a game's structure without any version's facts. */
const STAND_IN: TargetFacts = {
  id: 'msm-generated-ids',
  folders: { data: { function: 'function', tags: 'tags' } },
  commands: {
    forms: new Proxy({} as Record<string, string>, {
      get: (_forms, name) =>
        typeof name === 'string' ? (KEPT_FORMS[name] ?? '[command]') : undefined,
    }),
  },
} as unknown as TargetFacts;

type Add = (category: string, ...ids: string[]) => void;

/** Adds the ids `files` define (functions, function tags) and make (objectives, entity tags). */
function addIdsOf(files: readonly OutputFile[], add: Add): void {
  for (const file of files) {
    const fn = /^data\/([^/]+)\/function\/(.+)\.mcfunction$/.exec(file.path);
    if (fn !== null) add('function', `${fn[1]}:${fn[2]}`);
    const tag = /^data\/([^/]+)\/tags\/function\/(.+)\.json$/.exec(file.path);
    if (tag !== null) add('tag/function', `${tag[1]}:${tag[2]}`);
    if (!(file.contents instanceof Uint8Array)) continue;
    for (const line of new TextDecoder().decode(file.contents).split('\n')) {
      for (const m of line.matchAll(/scoreboard objectives add (\S+)/g))
        add('objective', m[1] as string);
      for (const m of line.matchAll(/tag @s add (\S+)/g)) add('tag', m[1] as string);
    }
  }
}

/** Adds the ids a game's round, lobby and roles write. */
export function addGameGeneratedIds(element: Element, add: Add): void {
  const context = { element, namespace: splitId(element.id).namespace, target: STAND_IN };
  addIdsOf([...roundFiles(context), ...lobbyFiles(context), ...rolesFiles(context)], add);
}

/** Adds the id of a kit's `give` function. */
export function addKitGeneratedIds(element: Element, add: Add): void {
  const { namespace, path } = splitId(element.id);
  add('function', `${namespace}:${GAMES_FUNCTION_ROOT}/kit/${path}/give`);
  // The kit's lines name no id of their own; lowering checks the element can be lowered.
  lowerKit(element, STAND_IN);
}
