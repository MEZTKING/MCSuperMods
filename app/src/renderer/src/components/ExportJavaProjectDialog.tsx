/**
 * The "Export Java project" dialog (ADR 0033): says what the eject writes and what it leaves
 * out (scripts, listed by id when the project has any, and the rules that need a script, ADR 0082
 * D10), then hands over to the host, which
 * asks for a folder and runs `session.exportJavaProject()`. Presentational: the host owns the
 * session and the export.
 *
 * @packageDocumentation
 */

import { bookRuleEntries, type RulesView } from '../session/rules-view';
import { Modal } from './NewElementDialog';
import { MoreOptions } from './ui/MoreOptions';
import { CheckOtherVersionsLine } from './upgrade/CheckOtherVersionsLine';

/** The dialog's first line: what it does, in the user's words (ADR 0130 D2). */
export const JAVA_PROJECT_DIALOG_INTRO =
  'Turns your mod into Java code in a new folder, for a programmer to keep working on. It is one way: changes made there do not come back into MCSuperMods.';

/** The plain line when the mod has scripts: how many the Java code leaves out (names below). */
export function javaProjectScriptsCount(count: number): string {
  return count === 1
    ? '1 script is left out: the Java code does not run scripts.'
    : `${count} scripts are left out: the Java code does not run scripts.`;
}

/** What the eject writes and that it is one-way. */
export const JAVA_PROJECT_DIALOG_NOTE =
  'Writes a standalone Fabric Gradle project with generated Java into a new folder. It does not depend on msm_runtime. Edits you make there do not come back into MCSuperMods. Scripts are not included.';

/** The second note, when the project has scripts: which ones the Java project leaves out. */
export function javaProjectScriptsNote(scripts: readonly string[]): string {
  const noun = scripts.length === 1 ? 'This script is' : 'These scripts are';
  return `${noun} not included in the Java project: ${scripts.join(', ')}.`;
}

/** A rule the Java project leaves out because it needs a script (`rules.not-in-eject`). */
export interface RuleNotInEject {
  bookId: string;
  /** The rule's key. */
  key: string;
  /** The rule's name, or its key when it has none. */
  label: string;
}

/**
 * The enabled rules that run in a generated script, book by book (books in id order): the eject
 * leaves them out, while plain rules go in as events (ADR 0082 D10).
 */
export function rulesNotInEject(view: RulesView): RuleNotInEject[] {
  const books = [...view.books].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return books.flatMap((book) => {
    const keys = view.scriptRuleKeys(book.id);
    if (keys.size === 0) return [];
    return bookRuleEntries(book)
      .filter((entry) => entry.enabled && keys.has(entry.key))
      .map((entry) => ({ bookId: book.id, key: entry.key, label: entry.name ?? entry.key }));
  });
}

/** The note above the list of rules the Java project leaves out. */
export function javaProjectRulesNote(count: number): string {
  return count === 1
    ? 'This rule needs a script, so it does nothing in the Java project. Rules without logic are in it as events; "Copy as my own script" in the rule book gives you the code to port by hand.'
    : 'These rules need a script, so they do nothing in the Java project. Rules without logic are in it as events; "Copy as my own script" in the rule book gives you the code to port by hand.';
}

/** The toast after a successful export. */
export function javaProjectWrittenMessage(location: string): string {
  return `Java project written to ${location}`;
}

/** The label of the toast's action that reveals the written folder. */
export const JAVA_PROJECT_REVEAL_LABEL = 'Reveal';

/** The problem code of a target folder that already holds files (ADR 0033 D4). */
export const FOLDER_NOT_EMPTY_CODE = 'export.folder-not-empty';

export interface ExportJavaProjectDialogProps {
  /** The ids of the project's scripts, which the Java project leaves out. */
  scripts: readonly string[];
  /** The rules left out because they need a script ({@link rulesNotInEject}). */
  rules?: readonly RuleNotInEject[];
  /** Asks for the folder and runs the export. */
  onExport(): void;
  onClose(): void;
  /** Opens **Move to another Minecraft version** at its other versions (ADR 0136 D7). */
  onCheckOtherVersions?(): void;
}

export function ExportJavaProjectDialog({
  scripts,
  rules = [],
  onExport,
  onClose,
  onCheckOtherVersions,
}: ExportJavaProjectDialogProps) {
  return (
    <Modal
      title="Export Java project"
      error={null}
      wide
      testId="java-project-dialog"
      submitLabel="Choose folder…"
      onCancel={onClose}
      onSubmit={onExport}
    >
      <p className="text-sm" data-testid="java-project-dialog-intro">
        {JAVA_PROJECT_DIALOG_INTRO}
      </p>
      {scripts.length > 0 && (
        <p className="text-muted text-sm" data-testid="java-project-scripts-count">
          {javaProjectScriptsCount(scripts.length)}
        </p>
      )}
      {rules.length > 0 && (
        <div className="flex flex-col gap-1 text-sm" data-testid="java-project-rules-note">
          <p className="text-muted">{javaProjectRulesNote(rules.length)}</p>
          <ul className="list-disc pl-5">
            {rules.map((rule) => (
              <li key={`${rule.bookId}#${rule.key}`} data-testid={`java-project-rule-${rule.key}`}>
                {rule.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <MoreOptions storageKey="dialog-java-project">
        <p className="text-muted text-sm" data-testid="java-project-note">
          {JAVA_PROJECT_DIALOG_NOTE}
        </p>
        {scripts.length > 0 && (
          <p className="text-muted text-sm" data-testid="java-project-scripts-note">
            {javaProjectScriptsNote(scripts)}
          </p>
        )}
        {rules.length > 0 && (
          <p className="text-muted text-sm" data-testid="java-project-rule-books">
            {`Rule books: ${[...new Set(rules.map((rule) => rule.bookId))].join(', ')}.`}
          </p>
        )}
        {onCheckOtherVersions && (
          <CheckOtherVersionsLine
            onOpen={onCheckOtherVersions}
            testId="java-project-other-versions"
          />
        )}
      </MoreOptions>
    </Modal>
  );
}
