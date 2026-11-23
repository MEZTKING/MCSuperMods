/**
 * The hub's tab "Story" (ADR 0132): a story told in steps through goals and dialogs. B721 stub, filled by B730 (batch 1: what is coming) and B742.
 *
 * @packageDocumentation
 */

/** The "Story" tab; until it is filled, one plain line. */
export function StoryTab() {
  return (
    <p className="text-sm" data-testid="game-hub-tab-story-coming">
      Stories are coming. Until then, use goals and dialogs.
    </p>
  );
}
