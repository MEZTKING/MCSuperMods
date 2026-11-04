/**
 * A standalone id combobox for Studio views (outside a `SchemaForm`): a text input with
 * suggestions in a `<datalist>`, committed on Enter or blur and reverted on Escape.
 */
import { useEffect, useId, useState } from 'react';
import { inputClass } from './scalars';

/** At most this many suggestions are listed. */
const MAX_SUGGESTIONS = 50;

/** Looks up ids of a registry (`item`, `tag/item`, ...) that start with a prefix. */
export type SuggestIds = (registry: string, prefix: string) => string[];

/**
 * Suggestions for an id of `registry`: with a leading `#`, the ids of `tag/<registry>` (with
 * `#` added); otherwise the registry's own ids.
 */
export function idSuggestions(
  suggest: SuggestIds | undefined,
  registry: string,
  prefix: string,
  limit = MAX_SUGGESTIONS,
): string[] {
  if (suggest === undefined) return [];
  if (prefix.startsWith('#')) {
    return suggest(`tag/${registry}`, prefix.slice(1))
      .map((id) => (id.startsWith('#') ? id : `#${id}`))
      .slice(0, limit);
  }
  return suggest(registry, prefix).slice(0, limit);
}

export interface IdInputProps {
  value: string;
  /** Called with the new text on Enter or blur, when it differs from `value`. */
  onCommit(text: string): void;
  /** Suggestions for the current text. */
  suggestions?: (text: string) => string[];
  label: string;
  testId?: string;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
}

export function IdInput({
  value,
  onCommit,
  suggestions,
  label,
  testId,
  invalid,
  placeholder,
  className,
}: IdInputProps) {
  const [text, setText] = useState(value);
  const listId = useId();
  useEffect(() => setText(value), [value]);
  const options = suggestions?.(text) ?? [];
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <>
      <input
        type="text"
        aria-label={label}
        aria-invalid={invalid === true}
        data-testid={testId}
        placeholder={placeholder}
        className={className === undefined ? inputClass : `${inputClass} ${className}`}
        spellCheck={false}
        list={options.length > 0 ? listId : undefined}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            setText(value);
          }
        }}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
      )}
    </>
  );
}

export interface IdDraftInputProps {
  value: string;
  onChange(text: string): void;
  /** Called on Enter. */
  onSubmit(): void;
  suggestions?: (text: string) => string[];
  label: string;
  testId?: string;
  placeholder?: string;
  className?: string;
}

/** A controlled id input for "add" rows: every keystroke reports, Enter submits. */
export function IdDraftInput({
  value,
  onChange,
  onSubmit,
  suggestions,
  label,
  testId,
  placeholder,
  className,
}: IdDraftInputProps) {
  const listId = useId();
  const options = suggestions?.(value) ?? [];
  return (
    <>
      <input
        type="text"
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        className={className === undefined ? inputClass : `${inputClass} ${className}`}
        spellCheck={false}
        list={options.length > 0 ? listId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
      )}
    </>
  );
}
