/**
 * The export dialogs' More options line for **Check on other versions…** (ADR 0136 D7, B820):
 * it opens **Move to another Minecraft version**, whose report lists how the mod does on each
 * version MCSuperMods makes mods for. Small and static: the rows themselves load with the report.
 *
 * @packageDocumentation
 */

/** The line's words. */
export const CHECK_OTHER_VERSIONS_LABEL = 'Check on other versions…';

/** One line: what it does and the button. */
export function CheckOtherVersionsLine(props: { onOpen(): void; testId: string }) {
  return (
    <p className="text-muted text-sm">
      {'Will your mod work on another Minecraft version? '}
      <button
        type="button"
        className="cursor-pointer text-accent underline-offset-2 hover:underline"
        data-testid={props.testId}
        onClick={props.onOpen}
      >
        {CHECK_OTHER_VERSIONS_LABEL}
      </button>
    </p>
  );
}
