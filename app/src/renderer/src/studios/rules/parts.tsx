/**
 * Small shared parts of the rule cards: the chip look, a menu of choices in a popover, and the
 * problem lines under a row.
 *
 * @packageDocumentation
 */

import type { Problem } from '@msm/core';
import { Popover } from 'radix-ui';
import type { ReactNode } from 'react';
import { useRulesEnv } from './env';

/** The class of a chip: a blank in a sentence. */
export function chipClass(state: { empty?: boolean; invalid?: boolean; muted?: boolean }): string {
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm cursor-pointer ' +
    'hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  if (state.invalid === true) return `${base} border-error text-error`;
  if (state.empty === true) return `${base} border-dashed border-accent text-accent`;
  if (state.muted === true) return `${base} border-border text-muted`;
  return `${base} border-border bg-bg font-medium`;
}

/** The popover holding a chip's editor. */
export const popoverClass =
  'z-50 flex max-h-[70vh] w-72 flex-col gap-2 overflow-auto rounded-md border border-border ' +
  'bg-panel p-3 text-sm text-text shadow-lg';

/** One choice of a {@link MenuList}. */
export interface MenuChoice {
  readonly key: string;
  readonly label: string;
  /** Shown in a heading above its group, in first-seen order. */
  readonly group?: string;
  readonly chosen?: boolean;
  readonly testId?: string;
}

/** A list of choices as buttons, grouped under headings. Picking closes the popover. */
export function MenuList(props: {
  choices: readonly MenuChoice[];
  onPick(key: string): void;
  label: string;
}) {
  const groups: { name: string | undefined; choices: MenuChoice[] }[] = [];
  for (const choice of props.choices) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.name === choice.group) last.choices.push(choice);
    else groups.push({ name: choice.group, choices: [choice] });
  }
  return (
    <fieldset aria-label={props.label} className="flex flex-col gap-1">
      {groups.map((group) => (
        <div key={group.name ?? '_'} className="flex flex-col gap-0.5">
          {group.name !== undefined && (
            <p className="mt-1 text-xs font-semibold text-muted">{group.name}</p>
          )}
          {group.choices.map((choice) => (
            <Popover.Close asChild key={choice.key}>
              <button
                type="button"
                aria-pressed={choice.chosen === true}
                data-testid={choice.testId}
                className={`rounded px-2 py-1 text-left cursor-pointer hover:bg-bg focus:bg-bg focus:outline-none ${choice.chosen === true ? 'font-semibold text-accent' : ''}`}
                onClick={() => props.onPick(choice.key)}
              >
                {choice.label}
              </button>
            </Popover.Close>
          ))}
        </div>
      ))}
    </fieldset>
  );
}

/** A chip-like trigger and a popover with `children`. */
export function ChipPopover(props: {
  label: string;
  ariaLabel: string;
  className: string;
  testId?: string | undefined;
  pointer?: string | undefined;
  invalid?: boolean;
  describedBy?: string | undefined;
  children: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
}) {
  return (
    <Popover.Root
      {...(props.open === undefined ? {} : { open: props.open })}
      {...(props.onOpenChange === undefined ? {} : { onOpenChange: props.onOpenChange })}
    >
      <Popover.Trigger
        className={props.className}
        aria-label={props.ariaLabel}
        aria-invalid={props.invalid === true ? true : undefined}
        aria-describedby={props.describedBy}
        data-testid={props.testId}
        data-pointer={props.pointer}
      >
        {props.label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className={popoverClass}>
          {props.children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The problem lines under a row, in plain words where the table has them. */
export function ProblemLines(props: {
  problems: readonly Problem[];
  id?: string;
  testId?: string;
}) {
  const env = useRulesEnv();
  if (props.problems.length === 0) return null;
  return (
    <ul id={props.id} className="flex flex-col gap-0.5 text-xs" data-testid={props.testId}>
      {props.problems.map((problem, index) => (
        <li
          key={index}
          role={problem.severity === 'error' ? 'alert' : undefined}
          className={problem.severity === 'error' ? 'text-error' : 'text-muted'}
        >
          {env.text(problem)}
        </li>
      ))}
    </ul>
  );
}
