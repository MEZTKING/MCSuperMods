/**
 * A read-only picture of a recipe (ADR 0043 D3, the Creator's Recipes tab): a 3x3 crafting
 * grid for shaped recipes (read with the Recipe Studio's `gridFromRecipe`), the ingredient list
 * of a shapeless recipe, the input of a cooking or stonecutting recipe and the three slots of a
 * smithing recipe, then an arrow and the result. Each slot shows an icon when the host has one
 * for the id, else the id as text.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { type GridCell, gridFromRecipe, ingredientText, isFilled } from '../../studios/recipe-grid';

type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Props of {@link RecipeGridView}. */
export interface RecipeGridViewProps {
  /** The recipe element's data. */
  recipe: Json;
  /** A `data:` URL for an item id, or `undefined` to show the id as text. */
  icon?(id: string): string | undefined;
  /** A display name for an item id (for the slot's label). */
  name?(id: string): string | undefined;
  /** Label of the picture, for example the recipe id. */
  label: string;
}

/** What one ingredient slot shows. */
function Slot(props: {
  cell: GridCell | undefined;
  icon: RecipeGridViewProps['icon'];
  name: RecipeGridViewProps['name'];
}) {
  const filled = props.cell !== undefined && isFilled(props.cell);
  const text = filled ? ingredientText(props.cell) : '';
  const id = typeof props.cell === 'string' ? props.cell : undefined;
  const src = id === undefined ? undefined : props.icon?.(id);
  const title = id === undefined ? text : (props.name?.(id) ?? id);
  return (
    <span
      role="img"
      aria-label={filled ? title : 'Empty slot'}
      title={filled ? title : undefined}
      className="flex size-12 items-center justify-center overflow-hidden rounded border border-border bg-bg text-center text-[0.6rem] leading-tight [overflow-wrap:anywhere]"
    >
      {src !== undefined ? (
        <img alt="" src={src} className="size-10 [image-rendering:pixelated]" />
      ) : filled ? (
        text.replace(/^minecraft:/, '')
      ) : null}
    </span>
  );
}

function resultOf(recipe: JsonObject): { id: string | undefined; count: number } {
  const result = recipe.result;
  if (typeof result === 'string') return { id: result, count: 1 };
  if (isObject(result)) {
    const id = typeof result.id === 'string' ? result.id : undefined;
    const count = typeof result.count === 'number' ? result.count : 1;
    return { id, count };
  }
  return { id: undefined, count: 1 };
}

const COOKING: Readonly<Record<string, string>> = {
  'minecraft:smelting': 'Furnace',
  'minecraft:blasting': 'Blast furnace',
  'minecraft:smoking': 'Smoker',
  'minecraft:campfire_cooking': 'Campfire',
  'minecraft:stonecutting': 'Stonecutter',
};

/** Draws one recipe as slots, an arrow and the result. */
export function RecipeGridView(props: RecipeGridViewProps) {
  const recipe = isObject(props.recipe) ? props.recipe : {};
  const type = typeof recipe.type === 'string' ? recipe.type : '';
  const slot = (cell: GridCell | undefined, key: string | number) => (
    <Slot key={key} cell={cell} icon={props.icon} name={props.name} />
  );
  let input: ReactNode;
  let station = 'Crafting table';
  if (type === 'minecraft:crafting_shaped') {
    const grid = gridFromRecipe(recipe.pattern, recipe.key);
    input = (
      <span className="grid w-fit grid-cols-3 gap-0.5">
        {grid.flatMap((row, r) => row.map((cell, c) => slot(cell, `${r}-${c}`)))}
      </span>
    );
  } else if (type === 'minecraft:crafting_shapeless') {
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    input = (
      <span className="grid w-fit grid-cols-3 gap-0.5">
        {Array.from({ length: Math.max(9, ingredients.length) }, (_, index) =>
          slot((ingredients[index] as GridCell | undefined) ?? null, index),
        )}
      </span>
    );
  } else if (type.startsWith('minecraft:smithing')) {
    station = 'Smithing table';
    input = (
      <span className="flex gap-0.5">
        {slot(recipe.template as GridCell | undefined, 'template')}
        {slot(recipe.base as GridCell | undefined, 'base')}
        {slot(recipe.addition as GridCell | undefined, 'addition')}
      </span>
    );
  } else {
    station = COOKING[type] ?? (type === '' ? 'Recipe' : type);
    input = slot(recipe.ingredient as GridCell | undefined, 'ingredient');
  }
  const result = resultOf(recipe);
  return (
    <figure
      aria-label={props.label}
      className="m-0 flex flex-col gap-1 rounded border border-border p-2"
    >
      <figcaption className="text-xs text-muted">
        <code className="font-mono">{props.label}</code> ({station})
      </figcaption>
      <span className="flex items-center gap-2">
        {input}
        <ArrowRight size={16} aria-hidden className="shrink-0 text-muted" />
        <span className="relative">
          {slot(result.id ?? null, 'result')}
          {result.count > 1 && (
            <span className="absolute right-0.5 bottom-0 text-xs font-semibold">
              {result.count}
            </span>
          )}
        </span>
      </span>
    </figure>
  );
}
