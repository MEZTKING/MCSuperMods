/**
 * What a game type's starter file declares (ADR 0132; plan `docs/PLAN-game-studio.md` D2, D7):
 * the arguments of the library's `starter()` and whether it is listed yet. `starters/index.ts`
 * turns each listed spec into a {@link ProjectStarter}, so a game type's file is the only file
 * its brief edits (B733 fills the four of batch 1 and sets `listed`).
 */
import type {
  BundleContext,
  ContentBundle,
  Json,
  OutputLayer,
  ProjectStarter,
  StarterCreatorInfo,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';

/** One game type's starter. */
export interface GameTypeStarterSpec {
  /**
   * Whether the starter is in the library's list. `false` while the type builds an empty bundle
   * (B721's stubs); the brief that fills the type sets it to `true`.
   */
  readonly listed: boolean;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly layers: readonly OutputLayer[];
  readonly build: (context: BundleContext) => ContentBundle;
  /** The targets the starter works on; omitted means every target. */
  readonly supports?: (target: TargetFacts) => boolean;
  /** The wizard's questions; a game type asks for a name (and some for a size) only (D7). */
  readonly parameters?: readonly StarterParameter[];
  /** The Creator's card, if the type is listed there too. */
  readonly creator?: StarterCreatorInfo;
  /** More answers whose bundles use kinds the default bundle does not. */
  readonly probeValues?: readonly Readonly<Record<string, Json>>[];
  /**
   * More fields of the finished starter, such as `game` (the catalogue's kind of game and
   * player counts, plugin API 1.27.0, B723), copied over the starter `starter()` makes.
   */
  readonly extra?: Readonly<Partial<ProjectStarter>>;
}

/** An empty bundle: what a game type builds until its brief fills it. */
export function emptyGameBundle(): ContentBundle {
  return { elements: [], assets: [] };
}
