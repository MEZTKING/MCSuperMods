/**
 * The hub's tab "Command blocks" (ADR 0132): commands in plain words and the command blocks inside a building. B721 stub, filled by B730 (batch 1: what is coming) and B743.
 *
 * @packageDocumentation
 */

/** The "Command blocks" tab; until it is filled, one plain line. */
export function CommandBlocksTab() {
  return (
    <p className="text-sm" data-testid="game-hub-tab-command-blocks-coming">
      Command blocks are coming. Until then, use the Function editor.
    </p>
  );
}
