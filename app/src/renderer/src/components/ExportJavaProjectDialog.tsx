/**
 * The "Export Java project" dialog (ADR 0033): says what the eject writes and what it leaves
 * out (scripts, listed by id when the project has any), then hands over to the host, which
 * asks for a folder and runs `session.exportJavaProject()`. Presentational: the host owns the
 * session and the export.
 *
 * @packageDocumentation
 */

import { Modal } from './NewElementDialog';

/** What the eject writes and that it is one-way. */
export const JAVA_PROJECT_DIALOG_NOTE =
  'Writes a standalone Fabric Gradle project with generated Java into a new folder. It does not depend on msm_runtime. Edits you make there do not come back into MCSuperMods. Scripts are not included.';

/** The second note, when the project has scripts: which ones the Java project leaves out. */
export function javaProjectScriptsNote(scripts: readonly string[]): string {
  const noun = scripts.length === 1 ? 'This script is' : 'These scripts are';
  return `${noun} not included in the Java project: ${scripts.join(', ')}.`;
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
  /** Asks for the folder and runs the export. */
  onExport(): void;
  onClose(): void;
}

export function ExportJavaProjectDialog({
  scripts,
  onExport,
  onClose,
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
      <p className="text-muted text-sm" data-testid="java-project-note">
        {JAVA_PROJECT_DIALOG_NOTE}
      </p>
      {scripts.length > 0 && (
        <p className="text-muted text-sm" data-testid="java-project-scripts-note">
          {javaProjectScriptsNote(scripts)}
        </p>
      )}
    </Modal>
  );
}
