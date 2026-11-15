/**
 * Home's "Make something" (ADR 0083 D2, ADR 0086 D8): big picture tiles, one per shown tile,
 * under the headings of `TILE_GROUPS` in the order of `MAKE_TILES`; "Surprise me" stands out.
 * Presentational: the host opens "Surprise me", the Creator flows, the starters, the Rule book,
 * the painter or the AI helper.
 *
 * @packageDocumentation
 */

import {
  Apple,
  Archive,
  Box,
  Brush,
  Bug,
  Car,
  Castle,
  CircleDot,
  Coins,
  Dices,
  Disc3,
  Earth,
  FlaskConical,
  Image,
  type LucideIcon,
  Package,
  Palette,
  PawPrint,
  ScrollText,
  Shield,
  Sparkle,
  Sparkles,
  Sprout,
  Swords,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import { type ShownTile, TILE_GROUPS } from './tiles';

/** The picture of each tile id. */
const TILE_ICONS: Readonly<Record<string, LucideIcon>> = {
  surprise: Dices,
  block: Box,
  machine: Archive,
  recipe: ScrollText,
  sparkles: Sparkle,
  wand: WandSparkles,
  world: Earth,
  building: Castle,
  drops: Coins,
  looks: Palette,
  painting: Image,
  sound: Disc3,
  item: Package,
  tool: Swords,
  armour: Shield,
  food: Apple,
  mob: Bug,
  pet: PawPrint,
  vehicle: Car,
  plant: Sprout,
  potion: FlaskConical,
  portal: CircleDot,
  rules: Workflow,
  paint: Brush,
  ai: Sparkles,
};

/** Props of {@link MakeTiles}. */
export interface MakeTilesProps {
  tiles: readonly ShownTile[];
  onTile(tile: ShownTile): void;
}

/** The "Make something" tiles, under their headings. */
export function MakeTiles({ tiles, onTile }: MakeTilesProps) {
  return (
    <section aria-labelledby="home-make-heading" className="flex flex-col gap-2">
      <h2 id="home-make-heading" className="font-semibold text-base">
        Make something
      </h2>
      {TILE_GROUPS.map((group) => {
        const shown = tiles.filter((entry) => entry.tile.group === group.id);
        if (shown.length === 0) return null;
        return (
          <section
            key={group.id}
            aria-label={group.title}
            data-testid={`home-group-${group.id}`}
            className="flex flex-col gap-1"
          >
            {group.id !== 'start' && (
              <h3 className="font-semibold text-muted text-xs uppercase tracking-wide">
                {group.title}
              </h3>
            )}
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-0">
              {shown.map((entry) => {
                const Icon = TILE_ICONS[entry.tile.id] ?? Sparkles;
                const surprise = entry.tile.action.type === 'surprise';
                return (
                  <li key={entry.tile.id} className={surprise ? 'col-span-2' : undefined}>
                    <button
                      type="button"
                      data-testid={`home-tile-${entry.tile.id}`}
                      className={`flex size-full cursor-pointer items-center gap-1 rounded-md border bg-panel p-3 text-center hover:border-accent focus-visible:border-accent ${
                        surprise
                          ? 'flex-row gap-3 border-accent text-left'
                          : 'flex-col border-border'
                      }`}
                      onClick={() => onTile(entry)}
                    >
                      <Icon aria-hidden size={40} className="shrink-0 text-accent" />
                      <span className="flex flex-col gap-1">
                        <span className="font-medium text-sm">{entry.tile.label}</span>
                        <span className="text-muted text-xs">{entry.tile.sentence}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
