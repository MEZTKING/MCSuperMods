/**
 * The host side of the search's actions (ADR 0124 D9; B664): what `run-action.ts` needs of the
 * app to turn a result's button into work. The app (`App.tsx`, B667) implements
 * {@link SearchActionHost}; tests use a fake one over a real project session.
 *
 * Writes go through `host.session` in `run-action.ts` itself, each as one undo step with a label
 * (a flow made at once, a starter or example added, an element from a template, a rule, a fix).
 * Everything that only opens something (the Creator, a Studio, Settings, the guide, a dialog) is
 * a host call: the host owns the dialogs and the selection.
 *
 * The action and preview descriptors themselves are plain data on the entries
 * (`sources/shared.ts`), re-exported here.
 *
 * @packageDocumentation
 */

import type { Json, Problem, ResourceLocation } from '@msm/core';
import type { ContentBundleBuilder, ProjectSession } from '../session/project-session';
import type { SearchDataPlugin } from './plugin-data';
import type {
  SearchActionDescriptor,
  SearchPreviewDescriptor,
  VanillaSort,
} from './sources/shared';

export type { SearchActionDescriptor, SearchPreviewDescriptor };

/** The modes the actions word their lines for (the app's `UiMode`). */
export type SearchActionMode = 'very-easy' | 'easy' | 'advanced';

/** What the actions use of the project session (the real `ProjectSession` in the app). */
export type SearchActionSession = Pick<
  ProjectSession,
  | 'snapshot'
  | 'library'
  | 'target'
  | 'registry'
  | 'kindDefault'
  | 'addBundle'
  | 'applyChangeset'
  | 'readWishlist'
  | 'writeWishlist'
>;

/** How the Creator opens on a new set with answers (`CreatorDialog`'s `start`, B657). */
export interface SearchCreatorStart {
  readonly flowId: string;
  readonly values: Readonly<Record<string, Json>>;
  /** The line above the questions ("Filled in from your words: the name, the colour."). */
  readonly note?: string;
}

/** A new mod asked for when none is open (as the Showcase's **Make this** asks, ADR 0118 D10). */
export interface SearchStartMod {
  /** The name offered ("Blue Sword Mod"). */
  readonly name: string;
  /**
   * What the new mod is made from (**Start a mod with this**: a starter with its answers, or an
   * example); absent for an empty mod the action then writes into.
   */
  readonly from?: {
    readonly source: ContentBundleBuilder;
    readonly values?: Readonly<Record<string, Json>>;
  };
}

/** One flow offered by **Make something with it**. */
export interface SearchMakeChoice {
  readonly flowId: string;
  readonly title: string;
  /** The question the thing answered ("Crafting ingredient"). */
  readonly questionLabel: string;
  readonly values: Readonly<Record<string, Json>>;
}

/** A line for the status bar or a toast. */
export interface SearchNotice {
  readonly kind: 'info' | 'error';
  readonly text: string;
}

/**
 * What the app gives the search's actions. Every `open…` call only shows something; nothing in
 * it writes to the project.
 */
export interface SearchActionHost {
  readonly session: SearchActionSession;
  readonly mode: SearchActionMode;
  /** The registered plugins (built-in, then third-party), for the behaviours' data. */
  readonly plugins: () => readonly SearchDataPlugin[];
  /** The sort of a vanilla id by the target's registries (**Make something with it**). */
  readonly vanillaSort?: (id: string) => VanillaSort | undefined;
  /** Notes the chosen result (the preferences' `rememberSearchChoice`). */
  rememberChoice(entryId: string): void;
  /** Shows a line. */
  notify(notice: SearchNotice): void;
  /**
   * No mod is open: asks for the mod's name (prefilled with `request.name`), makes the mod, from
   * `request.from` when given, and resolves `true` once it is open (`false` when cancelled).
   */
  startMod(request: SearchStartMod): Promise<boolean>;
  /** **Make this**: the Creator on a new set of the flow with the answers. */
  openCreator(start: SearchCreatorStart): void;
  /** A tile or card with several flows: Home's chooser. */
  chooseFlows(request: {
    readonly flows: readonly string[];
    readonly starters?: readonly string[];
    readonly tile?: string;
  }): void;
  /** **Make something with it** with several flows: which one (`null` when cancelled). */
  chooseMake(request: {
    readonly thing: string;
    readonly choices: readonly SearchMakeChoice[];
  }): Promise<SearchMakeChoice | null>;
  /** A rule's trigger needs the thing it is about: which one (`null` when cancelled). */
  chooseSubject(request: {
    readonly trigger: string;
    readonly choices: readonly { readonly id: ResourceLocation; readonly name: string }[];
  }): Promise<ResourceLocation | null>;
  /** A kind's **Make a new one**: the New element dialog on that kind (or template). */
  newElement(request: { readonly kind: string; readonly template?: string }): void;
  /** A kind's **Show mine**: the mod's things of it. */
  showMine(kind: string): void;
  openElement(id: ResourceLocation): void;
  renameElement(id: ResourceLocation): void;
  findUsages(id: ResourceLocation): void;
  /** The Creator reopened on the set the element belongs to. */
  editInCreator(id: ResourceLocation): void;
  openAsset(namespace: string, path: string): void;
  /** The Rule book on rule `index` of `book`. */
  openRule(book: ResourceLocation, index: number): void;
  /** **See the example**. */
  seeExample(exampleId: string): void;
  /** Settings opened at a line (`focusSetting`, B662). */
  openSettings(setting: string): void;
  runCommand(command: string): void;
  /** The guide reader at a heading (`GuideDialog`, B661). */
  openGuide(page: string, anchor: string): void;
  /** **Show me**: the thing at its field (Things to fix). */
  showProblem(problem: Problem): void;
  /** The painter on a missing picture (the `paint-picture` fix). */
  paintMissing(problem: Problem): void;
  /** Home's tiles. */
  surprise(): void;
  openRuleBook(): void;
  paint(): void;
  askAi(text?: string): void;
  copyText(text: string): void;
}

/** What one action did (for the host and tests). */
export type SearchActionOutcome =
  /** The project changed by one undo step with this label. */
  | { readonly status: 'written'; readonly label: string }
  /** Something was opened or shown; nothing was written. */
  | { readonly status: 'opened' }
  /** The user cancelled a question on the way. */
  | { readonly status: 'cancelled' }
  /** Nothing happened; the reason was shown. */
  | { readonly status: 'failed'; readonly message: string };

/**
 * How the live preview (B665) draws what each making action makes, before it is made (ADR 0124
 * D9 "The live rule"): `creator` is the Creator's own preview over `bundlePreviewProject` with the
 * understood answers; `bundle` the same preview over the starter's, example's or template's
 * bundle built in memory; `picture` the vanilla thing's picture from the user's jar (the flows it
 * opens then show the Creator's preview); `rule-card` the new rule as a read-only rule card.
 */
export type SearchMakingPreview = 'creator' | 'bundle' | 'picture' | 'rule-card';

/** The preview of each descriptor whose action writes or opens something to make. */
export const MAKING_PREVIEWS: Readonly<
  Partial<Record<SearchActionDescriptor['type'], SearchMakingPreview>>
> = Object.freeze({
  flow: 'creator',
  flows: 'creator',
  starter: 'bundle',
  example: 'bundle',
  template: 'bundle',
  vanilla: 'picture',
  'rule-part': 'rule-card',
});
