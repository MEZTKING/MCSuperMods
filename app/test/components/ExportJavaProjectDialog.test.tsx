// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExportJavaProjectDialog,
  JAVA_PROJECT_DIALOG_NOTE,
  javaProjectScriptsNote,
  javaProjectWrittenMessage,
} from '../../src/renderer/src/components/ExportJavaProjectDialog';

afterEach(cleanup);

describe('ExportJavaProjectDialog', () => {
  it('says what the eject writes and asks for a folder', async () => {
    const onExport = vi.fn();
    const onClose = vi.fn();
    render(<ExportJavaProjectDialog scripts={[]} onExport={onExport} onClose={onClose} />);
    const dialog = screen.getByTestId('java-project-dialog');
    expect(within(dialog).getByRole('heading', { name: 'Export Java project' })).toBeTruthy();
    expect(within(dialog).getByTestId('java-project-note').textContent).toBe(
      'Writes a standalone Fabric Gradle project with generated Java into a new folder. It does not depend on msm_runtime. Edits you make there do not come back into MCSuperMods. Scripts are not included.',
    );
    expect(JAVA_PROJECT_DIALOG_NOTE).toContain('Scripts are not included.');
    expect(within(dialog).queryByTestId('java-project-scripts-note')).toBeNull();
    const submit = within(dialog).getByTestId('java-project-dialog-submit');
    expect(submit.textContent).toBe('Choose folder…');
    await userEvent.setup().click(submit);
    expect(onExport).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lists the scripts the Java project leaves out', () => {
    render(
      <ExportJavaProjectDialog
        scripts={['demo:glow', 'demo:chime']}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('java-project-scripts-note').textContent).toBe(
      'These scripts are not included in the Java project: demo:glow, demo:chime.',
    );
    expect(javaProjectScriptsNote(['demo:glow'])).toBe(
      'This script is not included in the Java project: demo:glow.',
    );
  });

  it('closes on Cancel', async () => {
    const onClose = vi.fn();
    render(<ExportJavaProjectDialog scripts={[]} onExport={vi.fn()} onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('words the success toast', () => {
    expect(javaProjectWrittenMessage('/out/demo_mod')).toBe(
      'Java project written to /out/demo_mod',
    );
  });
});
