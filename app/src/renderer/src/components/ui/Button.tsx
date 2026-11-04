import { type ButtonHTMLAttributes, forwardRef } from 'react';

/** Shared class names for buttons, also used by Radix `asChild` triggers. */
export const buttonClass =
  'inline-flex items-center gap-1.5 rounded border border-border bg-panel px-2.5 py-1 text-sm ' +
  'cursor-pointer hover:enabled:border-accent disabled:cursor-default disabled:opacity-50';

/** Shared class names for compact icon-only buttons. */
export const iconButtonClass =
  'inline-flex size-6 shrink-0 items-center justify-center rounded text-muted ' +
  'cursor-pointer hover:enabled:bg-bg hover:enabled:text-text disabled:opacity-50';

/** Shared class names for Radix tab triggers. */
export const tabTriggerClass =
  'inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-1.5 text-sm text-muted ' +
  'cursor-pointer hover:text-text data-[state=active]:border-accent data-[state=active]:text-text';

/** A plain button with MSM styling; `type` defaults to `"button"`. */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ className, type, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={className === undefined ? buttonClass : `${buttonClass} ${className}`}
        {...props}
      />
    );
  },
);
