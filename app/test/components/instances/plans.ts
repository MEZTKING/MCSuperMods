/**
 * Offer card plans as main makes them (ADR 0133 D1, D3): the recipe from `@msm/interop`'s
 * `recipeFor` over the real targets, the card's words from `describeRecipe`, and the view main
 * hands the renderer (as `recipeView` and `kindOf` in `main/platform/instances.ts` make it; the
 * renderer's tests cannot import main's files).
 */
import { describeRecipe, type RunAction, type RunRecipe, recipeFor } from '@msm/interop';
import { targetById } from '@msm/targets';
import type {
  InstancePlan,
  InstancePlanRequest,
  InstanceRecipeView,
  ManagedKind,
} from '../../../src/shared/platform';

function factsOf(targetId: string) {
  const target = targetById(targetId)?.target;
  if (target === undefined) throw new Error(`No target ${targetId}`);
  return {
    mcVersion: target.mcVersion,
    channel: target.channel,
    java: target.java,
    ...(target.fabric === undefined ? {} : { fabric: target.fabric }),
  };
}

function kindOf(recipe: RunRecipe): ManagedKind {
  return recipe.place.kind === 'server' ? 'server' : recipe.place.role;
}

function recipeView(recipe: RunRecipe): InstanceRecipeView {
  return {
    purpose: recipe.purpose,
    owner: recipe.owner,
    mcVersion: recipe.mcVersion,
    channel: recipe.channel,
    java: recipe.java,
    loader: { kind: recipe.loader.kind, version: recipe.loader.version },
    place: { kind: recipe.place.kind, name: recipe.place.name },
    mods: recipe.mods.map((mod) => ({ role: mod.role, fileName: mod.fileName })),
    resourcePacks: recipe.resourcePacks.map((pack) => pack.fileName),
    world:
      recipe.world === null
        ? null
        : { folder: recipe.world.folder, copied: recipe.world.source !== null },
    join: recipe.join === null ? null : { host: recipe.join.host, port: recipe.join.port },
  };
}

/** Both targets (26.3 the default, the 26.4 snapshot). */
export const TARGET_IDS = ['mc-26.3', 'mc-26.4'] as const;

/** The purposes a card can be for, with the action and project main would see. */
export const PURPOSES = {
  test: { action: { kind: 'test' }, playsWithoutMods: false },
  game: { action: { kind: 'game' }, playsWithoutMods: false },
  plain: { action: { kind: 'plain' }, playsWithoutMods: true },
  modpack: {
    action: { kind: 'modpack', name: 'Cosy Pack', modIds: ['ruby_mod'] },
    playsWithoutMods: false,
  },
  map: {
    action: {
      kind: 'map',
      name: 'Sky Race',
      world: { folder: 'Sky Race', source: '/home/me/maps/Sky Race' },
    },
    playsWithoutMods: false,
  },
  server: { action: { kind: 'server' }, playsWithoutMods: false },
} as const satisfies Record<string, { action: RunAction; playsWithoutMods: boolean }>;

export type Purpose = keyof typeof PURPOSES;

/** The plan main would answer for `purpose` on `targetId`, nothing made yet. */
export function planFor(
  targetId: string,
  purpose: Purpose,
  overrides: Partial<InstancePlan> = {},
): { plan: InstancePlan; request: InstancePlanRequest } {
  const { action, playsWithoutMods } = PURPOSES[purpose];
  const project = { namespace: 'ruby_mod', modId: 'ruby_mod', playsWithoutMods };
  const recipe = recipeFor(action as RunAction, project, factsOf(targetId));
  const description = describeRecipe(recipe, { launcher: 'prism' });
  const plan: InstancePlan = {
    ok: true,
    recipe: recipeView(recipe),
    kind: kindOf(recipe),
    title: description.title,
    sentences: description.sentences,
    launcher: recipe.place.kind === 'server' ? null : 'prism',
    existing: null,
    ask: true,
    ...overrides,
  };
  const requestAction =
    action.kind === 'map' ? { kind: 'map' as const, name: action.name } : action;
  return {
    plan,
    request: {
      targetId,
      action: requestAction as InstancePlanRequest['action'],
      project,
    },
  };
}
