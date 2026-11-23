/**
 * The plain words of the offer card and of Settings' "Instances MSM made" (ADR 0133 D3, D5;
 * B764). Main writes the card's heading and sentences (`describeRecipe`); the renderer only
 * makes two of their phrases plainer ({@link plainSentence}). Everything else the card and the
 * list say is here: what each kind is for, how ready one of the user's own instances is, and the
 * buttons. No ids and no paths: those go under More options.
 *
 * @packageDocumentation
 */

import type {
  InstanceAskSetting,
  InstancePlan,
  InstanceRecipeView,
  ManagedKind,
  ManagedThing,
} from '../../../../shared/platform';
import type { InstallTargetOption } from '../install-target';
import { launcherLabel, loaderLabel } from '../install-target';

/** The words of the card and the list that do not depend on what is made. */
export const INSTANCE_WORDS = {
  remember: 'Do this by itself next time',
  rememberHint: 'MCSuperMods will make this kind of instance without asking.',
  useMine: 'Use one of mine instead…',
  useThis: 'Use this one',
  back: 'Back',
  cancel: 'Cancel',
  tryAgain: 'Try again',
  close: 'Close',
  pickTitle: 'Choose one of your instances',
  pickIntro: 'MCSuperMods puts what it needs into the one you choose. Nothing is made.',
  pickNone:
    'No instances of yours were found. Add a launcher folder in Settings, or let MCSuperMods make one.',
  building: 'Building your mod…',
  making: (name: string): string => `Making ${name}…`,
  updating: (name: string): string => `Bringing ${name} up to date…`,
  made: (name: string): string => `${name} is ready.`,
  listTitle: 'Instances MSM made',
  listIntro:
    'MCSuperMods makes these for playing and testing. It never changes your own instances. Remove moves one to the recycle bin with its worlds.',
  listEmpty: 'MCSuperMods has not made any yet. They are made the first time you play or test.',
  listLoading: 'Looking for them…',
  showInFolder: 'Show in folder',
  remove: 'Remove',
  removeAsk: (name: string): string =>
    `Move ${name} to the recycle bin? Its worlds and settings go with it.`,
  removeYes: 'Move to the recycle bin',
  removeNo: 'Keep it',
  removed: (name: string): string => `${name} was moved to the recycle bin.`,
  stopFirst: 'Stop the server before removing it.',
  running: 'Running now',
  askTitle: 'Ask before making an instance',
  askHint: 'MCSuperMods shows what it will make and waits for you.',
  askAgain: 'Ask again',
  madeByItself: (kinds: readonly ManagedKind[]): string =>
    `Made without asking now: ${listWords(kinds.map((kind) => KIND_NAMES[kind]))}.`,
} as const;

/** The choices of "Ask before making an instance", in the order the list shows them. */
export const ASK_CHOICES: readonly { value: InstanceAskSetting; label: string }[] = [
  { value: 'first-time', label: 'The first time for each kind' },
  { value: 'always', label: 'Every time' },
  { value: 'never', label: 'Never' },
];

/** Each kind of thing MSM makes, named in a sentence ("the test instance"). */
export const KIND_NAMES: Readonly<Record<ManagedKind, string>> = Object.freeze({
  test: 'the test instance',
  plain: 'the instance without mods',
  pack: "a modpack's instance",
  map: "a map's instance",
  server: 'a server',
});

/** "a, b and c". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * One of main's card sentences in plainer words: "Fabric API" is "Fabric's mod library" (the
 * jar's name stays under More options), and a server's `host:port` reads "host, port N".
 */
export function plainSentence(sentence: string): string {
  return sentence
    .replace(/\bFabric API\b/g, "Fabric's mod library")
    .replace(/\b([A-Za-z0-9.-]+):(\d{1,5})\b/g, '$1, port $2');
}

/** The make button's words: "Make it and play", or for a server "Make the server". */
export function makeLabel(plan: InstancePlan): string {
  if (plan.recipe.place.kind === 'server') return 'Make the server';
  return plan.existing === null ? 'Make it and play' : 'Bring it up to date and play';
}

/** The loader in words: "Fabric 0.17.2", or "No mod loader". */
export function loaderWords(loader: InstanceRecipeView['loader']): string {
  if (loader.kind === 'none') return 'No mod loader';
  return loaderLabel(loader) ?? 'No mod loader';
}

/** The heading of one of MSM's things in the list. */
export function thingTitle(thing: ManagedThing): string {
  if (thing.kind === 'server') {
    return thing.owner === null
      ? `Server (Minecraft ${thing.mcVersion})`
      : `Server for ${thing.owner} (Minecraft ${thing.mcVersion})`;
  }
  return thing.name;
}

/** What one of MSM's things is for, in one sentence. */
export function thingPurpose(thing: ManagedThing): string {
  switch (thing.kind) {
    case 'test':
      return 'Play and Test in Minecraft run your mod here.';
    case 'plain':
      return 'Opens games and maps the way players without mods have them.';
    case 'pack':
      return thing.owner === null
        ? 'Tests a modpack on its own.'
        : `Tests the modpack ${thing.owner} on its own.`;
    case 'map':
      return thing.owner === null ? 'Opens a map.' : `Opens the map ${thing.owner}.`;
    case 'server':
      return 'A server on this computer for playing with friends.';
  }
}

/** Where one of MSM's things lives and what runs it, in a short line. */
export function thingDetails(thing: ManagedThing): string {
  const where =
    thing.launcher === null
      ? 'On this computer'
      : `In ${thing.launcher === 'polymc' ? 'PolyMC' : launcherLabel(thing.launcher)}`;
  const loader =
    thing.loader.kind === 'none'
      ? 'no mod loader'
      : (loaderLabel(thing.loader) ?? thing.loader.kind);
  return `${where}. Minecraft ${thing.mcVersion}, ${loader}.`;
}

/** A server's state beyond its purpose, or `null` for an instance. */
export function thingState(thing: ManagedThing): string | null {
  if (thing.kind !== 'server') return null;
  if (thing.running) return INSTANCE_WORDS.running;
  return thing.eulaAccepted === true
    ? 'You accepted the Minecraft EULA for it.'
    : 'It waits for you to accept the Minecraft EULA.';
}

/** How ready one of the user's own instances is for a recipe, in words. */
export interface Readiness {
  /** Whether it can be chosen at all. */
  usable: boolean;
  /** Whether it needs nothing more (the same version and the right loader, and it starts). */
  ready: boolean;
  text: string;
}

/** How ready `option` is for `recipe` (ADR 0133 D3's "Use one of mine instead"). */
export function readinessOf(option: InstallTargetOption, recipe: InstanceRecipeView): Readiness {
  if (!option.installable || option.problems.length > 0) {
    return {
      usable: false,
      ready: false,
      text: option.problems[0] ?? 'MCSuperMods cannot put anything into this one.',
    };
  }
  const want = recipe.mcVersion;
  if (option.launcher === 'official') {
    return {
      usable: recipe.loader.kind === 'none',
      ready: false,
      text:
        recipe.loader.kind === 'none'
          ? 'You start the game yourself in the official launcher.'
          : 'The official launcher has no mod loader here, so your mod cannot run in it.',
    };
  }
  if (option.mcVersion !== null && option.mcVersion !== want) {
    return {
      usable: false,
      ready: false,
      text: `Made for Minecraft ${option.mcVersion}, not ${want}.`,
    };
  }
  const startsItself = option.launcher === 'prism' || option.launcher === 'multimc';
  const start = startsItself ? '' : ' You start the game yourself in the CurseForge app.';
  if (recipe.loader.kind === 'none') {
    if (option.loader !== null) {
      const name = loaderLabel(option.loader) ?? 'a mod loader';
      return {
        usable: true,
        ready: false,
        text: `It has ${name}, so it may not look the way players without mods see it.${start}`,
      };
    }
    return { usable: true, ready: startsItself, text: `Ready.${start}` };
  }
  if (option.loader === null) {
    return {
      usable: false,
      ready: false,
      text: 'It has no mod loader, and your mod needs Fabric.',
    };
  }
  if (option.loader.kind !== recipe.loader.kind) {
    const name = loaderLabel(option.loader) ?? 'another mod loader';
    return { usable: false, ready: false, text: `It uses ${name}, and your mod needs Fabric.` };
  }
  const version = option.mcVersion === null ? ' Its Minecraft version is not known.' : '';
  return {
    usable: true,
    ready: startsItself && version === '',
    text: `Ready: MCSuperMods adds your mod and Fabric's mod library.${version}${start}`,
  };
}
