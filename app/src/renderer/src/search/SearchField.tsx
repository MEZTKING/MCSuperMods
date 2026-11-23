/**
 * The search field (ADR 0124 D10, D11): a combobox over the panel's grouped listbox. The results
 * never take focus: the active row is named by `aria-activedescendant`, so typing goes on while
 * the arrows move. Large on the start surfaces, compact in the toolbar.
 *
 * @packageDocumentation
 */

import { forwardRef, type KeyboardEvent } from 'react';

export interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** The accessible name. */
  readonly label: string;
  readonly placeholder: string;
  /** The listbox's id. */
  readonly listId: string;
  /** Whether the listbox shows results. */
  readonly expanded: boolean;
  /** The active option's id, if any. */
  readonly activeId?: string | undefined;
  /** Ids of lines that describe the field (the Advanced prefixes). */
  readonly describedBy?: string | undefined;
  /** `large` on the start surfaces, `compact` in the toolbar. */
  readonly size?: 'large' | 'compact';
  readonly autoFocus?: boolean;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  {
    value,
    onChange,
    onKeyDown,
    label,
    placeholder,
    listId,
    expanded,
    activeId,
    describedBy,
    size = 'compact',
    autoFocus,
  },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      role="combobox"
      aria-label={label}
      aria-autocomplete="list"
      aria-expanded={expanded}
      aria-controls={listId}
      aria-activedescendant={activeId}
      aria-describedby={describedBy}
      data-testid="search-field"
      autoComplete="off"
      spellCheck={false}
      // biome-ignore lint/a11y/noAutofocus: the panel opens to be typed in (the door's own key or click).
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      className={`w-full min-w-0 rounded-md border border-border bg-bg text-text placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        size === 'large' ? 'px-4 py-3 text-lg' : 'px-2 py-1 text-sm'
      }`}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
});
