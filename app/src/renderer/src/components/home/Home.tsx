/**
 * Home (ADR 0083 D2): Very easy mode's editor area when no thing is open. With a project it
 * shows "Make something" (big tiles opening Creator flows, the Rule book, the painter or the AI
 * helper) and "My things" (one card per set or thing); without one it offers a new mod (a name
 * only, ADR 0083 D6), opening one and the recent mods. Presentational: the host does the work.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import { FilePlus, FolderOpen } from 'lucide-react';
import type { RecentProjectView } from '../../../../shared/platform';
import type { ThingPictures } from '../thing-picker/ThingPicker';
import { Button } from '../ui/Button';
import { MakeTiles } from './MakeTiles';
import { MyThings } from './MyThings';
import type { ThingCard } from './things';
import type { ShownTile } from './tiles';

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
  onOpenProject(): void;
  recentProjects?: readonly RecentProjectView[];
  onOpenRecent?(root: string): void;
}

/** Home. */
export function Home(props: HomeProps) {
  if (props.project === null) {
    const recent = (props.recentProjects ?? []).filter((entry) => entry.exists).slice(0, 6);
    return (
      <section
        aria-label="Home"
        data-testid="home"
        className="flex min-h-0 flex-col items-center gap-4 overflow-auto p-6"
      >
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
        </div>
        {recent.length > 0 && props.onOpenRecent !== undefined && (
          <section aria-labelledby="home-recent-heading" className="flex flex-col gap-1">
            <h2 id="home-recent-heading" className="text-center font-medium text-sm">
              Your mods
            </h2>
            <ul className="flex flex-col gap-1">
              {recent.map((entry, index) => (
                <li key={entry.root}>
                  <button
                    type="button"
                    data-testid={`home-recent-${index}`}
                    title={entry.root}
                    className="w-full cursor-pointer rounded px-2 py-1 text-left text-sm hover:bg-panel"
                    onClick={() => props.onOpenRecent?.(entry.root)}
                  >
                    {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
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
      <MakeTiles tiles={props.tiles} onTile={props.onTile} />
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
