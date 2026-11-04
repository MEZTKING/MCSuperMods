/**
 * Recipe Studio: a visual editor for the common recipe types over a `minecraft:recipe`
 * element's data. Shaped recipes get a 3x3 crafting grid (whose cells derive `pattern` and
 * `key`, see `recipe-grid.ts`), shapeless recipes an ingredient list, and the cooking family
 * one ingredient plus experience and cooking time. Any other type shows a notice: the host
 * renders the schema form instead. Presentational: props and callbacks only.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button, iconButtonClass } from '../components/ui/Button';
import {
  type ChangeOptions,
  type CompletionSource,
  type FormProblem,
  IdDraftInput,
  IdInput,
  idSuggestions,
  inputClass,
  isWithin,
  ProblemList,
} from '../forms';
import {
  deriveRecipe,
  GRID_SIZE,
  type GridCell,
  gridFromRecipe,
  ingredientText,
  isFilled,
  parseIngredient,
  setCell,
} from './recipe-grid';

type JsonObject = { [key: string]: Json };

/** Coalescing key that merges one grid edit's `pattern` and `key` changes. */
export const RECIPE_GRID_COALESCE = 'recipe-grid';

/** At most nine ingredients fit a crafting grid. */
const MAX_SHAPELESS = GRID_SIZE * GRID_SIZE;

/** The recipe types this Studio edits, by layout. */
export type RecipeLayout = 'shaped' | 'shapeless' | 'cooking';

const LAYOUTS: Readonly<Record<string, RecipeLayout>> = {
  crafting_shaped: 'shaped',
  crafting_shapeless: 'shapeless',
  smelting: 'cooking',
  blasting: 'cooking',
  smoking: 'cooking',
  campfire_cooking: 'cooking',
};

/** The layout for a recipe `type` (with or without `minecraft:`), or `undefined`. */
export function recipeLayout(type: Json | undefined): RecipeLayout | undefined {
  if (typeof type !== 'string') return undefined;
  const bare = type.startsWith('minecraft:') ? type.slice('minecraft:'.length) : type;
  return Object.hasOwn(LAYOUTS, bare) ? LAYOUTS[bare] : undefined;
}

export interface RecipeStudioProps {
  data: Json;
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  completions?: CompletionSource;
  problems?: readonly FormProblem[];
  /** Suggested `category` values for the current type (from the schema, by the host). */
  categories?: readonly string[];
  /** The schema form, shown instead of the Studio when "Advanced" is on. */
  children?: ReactNode;
}

function asObject(value: Json | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function problemsWithin(
  problems: readonly FormProblem[] | undefined,
  ...pointers: string[]
): FormProblem[] {
  return (problems ?? []).filter((problem) =>
    pointers.some((pointer) => isWithin(problem.path, pointer)),
  );
}

export function RecipeStudio({
  data,
  onChange,
  completions,
  problems,
  categories,
  children,
}: RecipeStudioProps) {
  const [advanced, setAdvanced] = useState(false);
  const recipe = asObject(data);
  const layout = recipeLayout(recipe.type);
  const suggestItems = (text: string) =>
    idSuggestions(completions?.suggest.bind(completions), 'item', text);

  let body: ReactNode;
  if (advanced) {
    body = children ?? null;
  } else if (layout === undefined) {
    body = (
      <p role="status" className="px-2 text-muted text-sm">
        The Recipe Studio does not edit {JSON.stringify(recipe.type ?? null)} recipes; use the form.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3 px-2">
        {layout === 'shaped' && (
          <ShapedGrid
            recipe={recipe}
            onChange={onChange}
            suggest={suggestItems}
            problems={problems}
          />
        )}
        {layout === 'shapeless' && (
          <ShapelessList
            recipe={recipe}
            onChange={onChange}
            suggest={suggestItems}
            problems={problems}
          />
        )}
        {layout === 'cooking' && (
          <CookingFields
            recipe={recipe}
            onChange={onChange}
            suggest={suggestItems}
            problems={problems}
          />
        )}
        <ResultFields
          recipe={recipe}
          onChange={onChange}
          suggest={suggestItems}
          problems={problems}
        />
        <BookFields
          recipe={recipe}
          onChange={onChange}
          categories={categories}
          problems={problems}
        />
      </div>
    );
  }

  return (
    <section aria-label="Recipe" data-testid="recipe-studio" className="flex flex-col gap-2">
      {layout !== undefined && (
        <label className="flex items-center gap-1.5 self-end px-2 text-sm">
          <input
            type="checkbox"
            data-testid="recipe-advanced-toggle"
            checked={advanced}
            onChange={(event) => setAdvanced(event.target.checked)}
          />
          Advanced (all fields)
        </label>
      )}
      {body}
    </section>
  );
}

interface SectionProps {
  recipe: JsonObject;
  onChange: RecipeStudioProps['onChange'];
  suggest: (text: string) => string[];
  problems: readonly FormProblem[] | undefined;
}

function ShapedGrid({ recipe, onChange, suggest, problems }: SectionProps) {
  const grid = gridFromRecipe(recipe.pattern, recipe.key);
  const edit = (row: number, column: number, text: string) => {
    const next = setCell(grid, row, column, parseIngredient(text));
    const { pattern, key } = deriveRecipe(next, recipe.key);
    onChange('/pattern', pattern, { coalesce: RECIPE_GRID_COALESCE });
    onChange('/key', key, { coalesce: RECIPE_GRID_COALESCE });
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 font-medium text-sm">Crafting grid</legend>
      <div className="grid w-fit grid-cols-3 gap-1">
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <IdInput
              key={`${r}-${c}`}
              value={ingredientText(cell)}
              onCommit={(text) => edit(r, c, text)}
              suggestions={suggest}
              label={`Grid row ${r + 1} column ${c + 1}`}
              testId={`recipe-cell-${r}-${c}`}
              placeholder="Empty"
              className={isFilled(cell) ? 'w-40 font-mono' : 'w-40 font-mono opacity-80'}
            />
          )),
        )}
      </div>
      <p className="text-muted text-xs">
        Type an item id, a #tag, or several ids separated by commas. Empty rows and columns are
        trimmed.
      </p>
      <ProblemList problems={problemsWithin(problems, '/pattern', '/key')} />
    </fieldset>
  );
}

function ShapelessList({ recipe, onChange, suggest, problems }: SectionProps) {
  const items: Json[] = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const [draft, setDraft] = useState('');
  const set = (next: Json[]) => onChange('/ingredients', next);
  const add = () => {
    const cell = parseIngredient(draft);
    if (cell === null || items.length >= MAX_SHAPELESS) return;
    set([...items, cell]);
    setDraft('');
  };
  const move = (from: number, to: number) => {
    const next = [...items];
    const [entry] = next.splice(from, 1);
    if (entry === undefined) return;
    next.splice(to, 0, entry);
    set(next);
  };
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 font-medium text-sm">Ingredients</legend>
      <ol className="flex flex-col gap-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-1">
            <IdInput
              value={ingredientText(item as GridCell)}
              onCommit={(text) => {
                const cell = parseIngredient(text);
                if (cell === null) set(items.filter((_, i) => i !== index));
                else onChange(`/ingredients/${index}`, cell);
              }}
              suggestions={suggest}
              label={`Ingredient ${index + 1}`}
              testId={`recipe-ingredient-${index}`}
              className="max-w-72 font-mono"
            />
            <button
              type="button"
              aria-label={`Move ingredient ${index + 1} up`}
              className={iconButtonClass}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              <ArrowUp size={12} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Move ingredient ${index + 1} down`}
              className={iconButtonClass}
              disabled={index === items.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDown size={12} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Remove ingredient ${index + 1}`}
              className={iconButtonClass}
              onClick={() => set(items.filter((_, i) => i !== index))}
            >
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-1">
        <IdDraftInput
          value={draft}
          onChange={setDraft}
          onSubmit={add}
          suggestions={suggest}
          label="New ingredient"
          testId="recipe-ingredient-new"
          placeholder="minecraft:stick or #minecraft:planks"
          className="max-w-72 font-mono"
        />
        <Button
          className="text-xs"
          onClick={add}
          disabled={items.length >= MAX_SHAPELESS}
          aria-label="Add ingredient"
        >
          <Plus size={12} aria-hidden />
          Add
        </Button>
      </div>
      <ProblemList problems={problemsWithin(problems, '/ingredients')} />
    </fieldset>
  );
}

function CookingFields({ recipe, onChange, suggest, problems }: SectionProps) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 font-medium text-sm">Cooking</legend>
      <div className="flex flex-col gap-0.5 text-sm">
        <span aria-hidden>Ingredient</span>
        <IdInput
          value={ingredientText((recipe.ingredient ?? null) as GridCell)}
          onCommit={(text) => {
            const cell = parseIngredient(text);
            onChange('/ingredient', cell === null ? undefined : cell);
          }}
          suggestions={suggest}
          label="Ingredient"
          testId="recipe-ingredient"
          className="max-w-72 font-mono"
        />
      </div>
      <ProblemList problems={problemsWithin(problems, '/ingredient')} />
      <div className="flex flex-wrap gap-3">
        <NumberField
          label="Experience"
          pointer="/experience"
          value={recipe.experience}
          step={0.1}
          onChange={onChange}
          problems={problems}
        />
        <NumberField
          label="Cooking time (ticks)"
          pointer="/cookingtime"
          value={recipe.cookingtime}
          step={1}
          integer
          onChange={onChange}
          problems={problems}
        />
      </div>
    </fieldset>
  );
}

function ResultFields({ recipe, onChange, suggest, problems }: SectionProps) {
  const result = asObject(recipe.result);
  const hasResult = Object.hasOwn(recipe, 'result') && Object.keys(result).length > 0;
  const setResult = (key: string, value: Json | undefined) => {
    if (!hasResult) {
      if (value !== undefined) onChange('/result', { [key]: value });
      return;
    }
    onChange(`/result/${key}`, value);
  };
  const id = typeof result.id === 'string' ? result.id : '';
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 font-medium text-sm">Result</legend>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-0.5 text-sm">
          <span aria-hidden>Item</span>
          <IdInput
            value={id}
            onCommit={(text) => setResult('id', text.trim())}
            suggestions={(text) => suggest(text).filter((entry) => !entry.startsWith('#'))}
            label="Result item"
            testId="recipe-result"
            className="w-72 font-mono"
          />
        </div>
        <NumberField
          label="Count"
          pointer="/result/count"
          value={result.count}
          step={1}
          integer
          min={1}
          onChange={(_pointer, value) => setResult('count', value)}
          problems={problems}
        />
      </div>
      <ProblemList
        problems={problemsWithin(problems, '/result').filter(
          (problem) => problem.path !== '/result/count',
        )}
      />
    </fieldset>
  );
}

function BookFields({
  recipe,
  onChange,
  categories,
  problems,
}: {
  recipe: JsonObject;
  onChange: RecipeStudioProps['onChange'];
  categories: readonly string[] | undefined;
  problems: readonly FormProblem[] | undefined;
}) {
  const listId = useId();
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 font-medium text-sm">Recipe book</legend>
      <div className="flex flex-wrap gap-3">
        <TextField
          label="Group"
          pointer="/group"
          value={recipe.group}
          onChange={onChange}
          problems={problems}
        />
        <TextField
          label="Category"
          pointer="/category"
          value={recipe.category}
          onChange={onChange}
          problems={problems}
          listId={categories !== undefined && categories.length > 0 ? listId : undefined}
        />
        {categories !== undefined && categories.length > 0 && (
          <datalist id={listId}>
            {categories.map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
        )}
      </div>
    </fieldset>
  );
}

/** An optional text field; clearing it removes the key. */
function TextField({
  label,
  pointer,
  value,
  onChange,
  problems,
  listId,
}: {
  label: string;
  pointer: string;
  value: Json | undefined;
  onChange: RecipeStudioProps['onChange'];
  problems: readonly FormProblem[] | undefined;
  listId?: string | undefined;
}) {
  const own = problemsWithin(problems, pointer);
  return (
    <label className="flex flex-col gap-0.5 text-sm">
      <span>{label}</span>
      <input
        type="text"
        aria-invalid={own.some((problem) => problem.severity === 'error')}
        className={`${inputClass} w-48`}
        spellCheck={false}
        list={listId}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) =>
          onChange(pointer, event.target.value === '' ? undefined : event.target.value, {
            coalesce: `typing:${pointer}`,
          })
        }
      />
      <ProblemList problems={own} />
    </label>
  );
}

/** An optional number field; clearing it removes the key. */
function NumberField({
  label,
  pointer,
  value,
  step,
  integer,
  min,
  onChange,
  problems,
}: {
  label: string;
  pointer: string;
  value: Json | undefined;
  step: number;
  integer?: boolean;
  min?: number;
  onChange: RecipeStudioProps['onChange'];
  problems: readonly FormProblem[] | undefined;
}) {
  const own = problemsWithin(problems, pointer);
  return (
    <label className="flex flex-col gap-0.5 text-sm">
      <span>{label}</span>
      <input
        type="number"
        aria-invalid={own.some((problem) => problem.severity === 'error')}
        className={`${inputClass} w-32`}
        step={step}
        min={min}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => {
          const text = event.target.value;
          if (text === '') {
            onChange(pointer, undefined, { coalesce: `typing:${pointer}` });
            return;
          }
          const parsed = integer === true ? Number.parseInt(text, 10) : Number(text);
          if (Number.isFinite(parsed)) {
            onChange(pointer, parsed, { coalesce: `typing:${pointer}` });
          }
        }}
      />
      <ProblemList problems={own} />
    </label>
  );
}
