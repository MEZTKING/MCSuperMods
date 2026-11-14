/**
 * Home's "Make something" (ADR 0083 D2): big picture tiles, one per shown tile, in the order of
 * `MAKE_TILES`. Presentational: the host opens the Creator flows, the Rule book, the painter or
 * the AI helper.
 *
 * @packageDocumentation
 */

import {
  Apple,
  Box,
  Brush,
  Bug,
  CircleDot,
  FlaskConical,
  type LucideIcon,
  Package,
  PawPrint,
  Shield,
  Sparkles,
  Sprout,
  Swords,
  Workflow,
} from 'lucide-react';
import type { ShownTile } from './tiles';

/** The picture of each tile id. */
const TILE_ICONS: Readonly<Record<string, LucideIcon>> = {
  block: Box,
  item: Package,
  tool: Swords,
  armour: Shield,
  food: Apple,
  mob: Bug,
  pet: PawPrint,
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

/** The "Make something" tiles. */
export function MakeTiles({ tiles, onTile }: MakeTilesProps) {
  return (
    <section aria-labelledby="home-make-heading" className="flex flex-col gap-2">
      <h2 id="home-make-heading" className="font-semibold text-base">
        Make something
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {tiles.map((shown) => {
          const Icon = TILE_ICONS[shown.tile.id] ?? Sparkles;
          return (
            <li key={shown.tile.id}>
              <button
                type="button"
                data-testid={`home-tile-${shown.tile.id}`}
                className="flex size-full cursor-pointer flex-col items-center gap-1 rounded-md border border-border bg-panel p-3 text-center hover:border-accent focus-visible:border-accent"
                onClick={() => onTile(shown)}
              >
                <Icon aria-hidden size={40} className="text-accent" />
                <span className="font-medium text-sm">{shown.tile.label}</span>
                <span className="text-muted text-xs">{shown.tile.sentence}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
