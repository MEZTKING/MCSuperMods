/**
 * Home (ADR 0083 D2): Very easy mode's editor area when no thing is open. With a project it
 * shows "Make something" (big tiles opening Creator flows, the Rule book, the painter or the AI
 * helper) and "My things" (one card per set or thing); without one it offers a new mod (a name
 * only, ADR 0083 D6), opening one, "Surprise me" (ADR 0086) and the recent mods. Presentational: the host does the work.
 *
 * The showcase **See what you can make** (ADR 0118 D1; B569), built by the host, sits under
 * the buttons without a mod, and between the Make tiles and My things with one: open while the
 * mod has no things, folded to a **Show what you can make** link after that (the fold is the
 * host's preference). Test ids: `home-showcase`, `home-showcase-show`, `home-showcase-hide`.
 *
 * The search's large bar (ADR 0124 D10; B667), built by the host, heads Home with and without a
 * mod (`home-search`).
 *
 * Without a mod (ADR 0128 D5): the start buttons, **Your mods** as cards when there are any
 * (`YourMods.tsx`), the showcase, then **More ideas**, the endless idea cards (built by the host,
 * `MoreIdeas.tsx`).
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import { Dices, FilePlus, FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RecentProjectSummary, RecentProjectView } from '../../../../shared/platform';
import type { ThingPictures } from '../thing-picker/ThingPicker';
import { Button } from '../ui/Button';
import { MakeTiles } from './MakeTiles';
import { MyThings } from './MyThings';
import type { ThingCard } from './things';
import type { ShownTile } from './tiles';
import { YourMods } from './YourMods';

/** Props of {@link Home}. */
export interface HomeProps {
  project: Project | null;
  tiles: readonly ShownTile[];
  onTile(tile: ShownTile): void;
  cards: readonly ThingCard[];
  /** The target's texture folder, for the cards' pictures. */
  texturesFolder: string;
  pictures?: ThingPictures | null;
  onOpenThing(card: ThingCard): void;
  onEditInCreator?(card: ThingCard): void;
  onRenameThing(card: ThingCard): void;
  onDuplicateThing(card: ThingCard): void;
  onDeleteThing(card: ThingCard): void;
  /** Starts a new mod (asks only for a name). */
  onNewProject(): void;
  /** "Surprise me": a random mod (ADR 0086); without a mod open it starts a new one. */
  onSurprise?(): void;
  onOpenProject(): void;
  recentProjects?: readonly RecentProjectView[];
  onOpenRecent?(root: string): void;
  /** Your mods' **Remove from this list** (ADR 0128 D4). */
  onRemoveRecent?(root: string): void;
  /** Your mods' **Show in folder**. */
  onShowRecentInFolder?(root: string): void;
  /** Reads a recent mod's picture and thing count for its card. */
  recentSummary?(root: string): Promise<RecentProjectSummary>;
  /** **More ideas** (ADR 0128 D1), under the showcase without a mod; absent shows none. */
  moreIdeas?: ReactNode;
  /** The showcase gallery (**See what you can make**); absent shows none. */
  showcase?: ReactNode;
  /** Whether the showcase stays open for a mod that has things (default folded). */
  showcaseOpen?: boolean;
  /** Opens or folds the showcase of a mod that has things. */
  onShowcaseOpenChange?(open: boolean): void;
  /** The search's large bar ("What do you want to make?"); absent shows none. */
  search?: ReactNode;
}

/** The link that opens the folded showcase (ADR 0118 D1). */
export const SHOW_SHOWCASE = 'Show what you can make';
/** The link that folds it again. */
export const HIDE_SHOWCASE = 'Hide what you can make';

const linkClass =
  'self-start cursor-pointer text-accent text-sm underline-offset-2 hover:underline';

/** The showcase of a Home with a mod: open while it has no things, else folded (ADR 0118 D1). */
function ModShowcase(props: HomeProps) {
  if (props.showcase === undefined || props.showcase === null) return null;
  if (props.cards.length === 0) {
    return <div data-testid="home-showcase">{props.showcase}</div>;
  }
  if (props.showcaseOpen !== true) {
    return (
      <button
        type="button"
        data-testid="home-showcase-show"
        className={linkClass}
        onClick={() => props.onShowcaseOpenChange?.(true)}
      >
        {SHOW_SHOWCASE}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid="home-showcase">
      {props.showcase}
      <button
        type="button"
        data-testid="home-showcase-hide"
        className={linkClass}
        onClick={() => props.onShowcaseOpenChange?.(false)}
      >
        {HIDE_SHOWCASE}
      </button>
    </div>
  );
}

/** Home. */
export function Home(props: HomeProps) {
  if (props.project === null) {
    const recent = props.recentProjects ?? [];
    return (
      <section
        aria-label="Home"
        data-testid="home"
        className="flex min-h-0 flex-col items-center gap-4 overflow-auto p-6"
      >
        {props.search !== undefined && props.search !== null && (
          <div className="flex w-full justify-center" data-testid="home-search">
            {props.search}
          </div>
        )}
        <h1 className="font-semibold text-lg">Make your own Minecraft mod</h1>
        <p className="max-w-prose text-center text-muted text-sm">
          A mod is a set of new things for Minecraft: blocks, items, mobs and what they do. Start a
          new one, then pick what to make.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button data-testid="home-new" onClick={props.onNewProject}>
            <FilePlus size={16} aria-hidden />
            Start a new mod
          </Button>
          <Button data-testid="home-open" onClick={props.onOpenProject}>
            <FolderOpen size={16} aria-hidden />
            Open a mod
          </Button>
          {props.onSurprise !== undefined && (
            <Button data-testid="home-surprise" onClick={props.onSurprise}>
              <Dices size={16} aria-hidden />
              Surprise me
            </Button>
          )}
        </div>
        {props.onSurprise !== undefined && (
          <p className="max-w-prose text-center text-muted text-xs">
            Not sure what to make? Surprise me makes a random mod to start from.
          </p>
        )}
        {props.onOpenRecent !== undefined && (
          <YourMods
            recent={recent}
            onOpen={props.onOpenRecent}
            {...(props.onRemoveRecent === undefined ? {} : { onRemove: props.onRemoveRecent })}
            {...(props.onShowRecentInFolder === undefined
              ? {}
              : { onShowInFolder: props.onShowRecentInFolder })}
            {...(props.recentSummary === undefined ? {} : { summary: props.recentSummary })}
          />
        )}
        {props.showcase !== undefined && props.showcase !== null && (
          <div className="w-full max-w-5xl" data-testid="home-showcase">
            {props.showcase}
          </div>
        )}
        {props.moreIdeas !== undefined && props.moreIdeas !== null && (
          <div className="w-full max-w-5xl">{props.moreIdeas}</div>
        )}
      </section>
    );
  }
  return (
    <section
      aria-label="Home"
      data-testid="home"
      className="flex min-h-0 flex-col gap-5 overflow-auto p-4"
    >
      {props.search !== undefined && props.search !== null && (
        <div className="flex w-full justify-center" data-testid="home-search">
          {props.search}
        </div>
      )}
      <MakeTiles tiles={props.tiles} onTile={props.onTile} />
      <ModShowcase {...props} />
      <MyThings
        project={props.project}
        cards={props.cards}
        texturesFolder={props.texturesFolder}
        pictures={props.pictures ?? null}
        onOpen={props.onOpenThing}
        {...(props.onEditInCreator === undefined ? {} : { onEditInCreator: props.onEditInCreator })}
        onRename={props.onRenameThing}
        onDuplicate={props.onDuplicateThing}
        onDelete={props.onDeleteThing}
      />
    </section>
  );
}
