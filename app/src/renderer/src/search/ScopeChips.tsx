/**
 * The scope chips (ADR 0124 D10): Make, My mod, Minecraft and Help in every mode, and Commands
 * outside Very easy. One at a time; pressing the chosen one again looks everywhere. Advanced shows
 * each chip's prefix (`>`, `@`, `#`, `?`), which typed at the start of the field chooses the same.
 *
 * @packageDocumentation
 */

import type { SearchMode } from '@msm/search';
import {
  SCOPE_LABELS,
  SCOPE_PREFIXES,
  type SearchScope,
  scopesShown,
  searchWords,
} from './wording';

export interface ScopeChipsProps {
  readonly mode: SearchMode;
  /** The chosen scope, or `undefined` for everywhere. */
  readonly scope: SearchScope | undefined;
  readonly onScope: (scope: SearchScope | undefined) => void;
}

export function ScopeChips({ mode, scope, onScope }: ScopeChipsProps) {
  const shown = scopesShown(mode);
  // A scope the mode hides (the palette's commands in Very easy) still shows while it is chosen.
  const chips = scope !== undefined && !shown.includes(scope) ? [...shown, scope] : shown;
  return (
    <fieldset
      aria-label={searchWords(mode).scopesLabel}
      data-testid="search-scopes"
      className="m-0 flex flex-wrap items-center gap-1 border-0 p-0"
    >
      {chips.map((id) => {
        const on = scope === id;
        const prefix = SCOPE_PREFIXES[id];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            data-testid={`search-scope-${id}`}
            className={`rounded-full border px-2 py-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              on ? 'border-accent bg-accent/15 font-semibold text-text' : 'border-border text-muted'
            }`}
            onClick={() => onScope(on ? undefined : id)}
          >
            {SCOPE_LABELS[id]}
            {mode === 'advanced' && prefix !== '' && (
              <kbd className="ml-1 font-mono text-muted">{prefix}</kbd>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
