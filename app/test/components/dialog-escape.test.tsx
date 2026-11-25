// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DropdownMenu, Toast } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusToast } from '../../src/renderer/src/components/StatusToast';
import { DialogContent, DialogRoot } from '../../src/renderer/src/components/ui/DialogContent';
import { useUiStore } from '../../src/renderer/src/store/ui-store';

/**
 * Escape in a dialog when a status toast appeared after it (B714): the toast is a newer Radix
 * dismissable layer, which alone gets Escape from Radix, so the first Escape closed the toast and
 * left the dialog open. `DialogContent` closes the dialog on an Escape no layer of its own took.
 */

afterEach(() => {
  cleanup();
  useUiStore.getState().setMessage(null);
});

function Shell(props: { children: ReactNode }) {
  return (
    <Toast.Provider>
      {props.children}
      <StatusToast />
    </Toast.Provider>
  );
}

function TestDialog(props: {
  plain?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  children?: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(true);
  const Content = props.plain === true ? Dialog.Content : DialogContent;
  const testId = props.testId ?? 'test-dialog';
  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Content
          data-testid={testId}
          aria-describedby={undefined}
          {...(props.onEscapeKeyDown === undefined
            ? {}
            : { onEscapeKeyDown: props.onEscapeKeyDown })}
        >
          <Dialog.Title>Export</Dialog.Title>
          <input data-testid={`${testId}-field`} />
          {props.children}
        </Content>
      </Dialog.Portal>
    </DialogRoot>
  );
}

/** Opens a dialog, focuses its field, then shows a status message (a newer layer). */
async function dialogThenToast(dialog: ReactNode, testId = 'test-dialog') {
  render(<Shell>{dialog}</Shell>);
  screen.getByTestId(`${testId}-field`).focus();
  useUiStore.getState().setMessage({ kind: 'info', text: 'Exported the data pack.' });
  await screen.findByTestId('status-toast-text');
  return userEvent.setup();
}

describe('Escape in a dialog with a status toast above it (B714)', () => {
  it('a plain Radix dialog keeps the first Escape for the toast (the cause)', async () => {
    const user = await dialogThenToast(<TestDialog plain />);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('status-toast-text')).toBeNull());
    expect(screen.getByTestId('test-dialog')).toBeTruthy();
  });

  it('closes the dialog on the first Escape', async () => {
    const user = await dialogThenToast(<TestDialog />);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('test-dialog')).toBeNull());
  });

  it("follows the dialog's own Escape rule", async () => {
    const rule = vi.fn((event: KeyboardEvent) => event.preventDefault());
    const user = await dialogThenToast(<TestDialog onEscapeKeyDown={rule} />);
    await user.keyboard('{Escape}');
    expect(rule).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('test-dialog')).toBeTruthy();
  });

  it('closes only the top dialog of two', async () => {
    const user = await dialogThenToast(
      <TestDialog testId="outer">
        <TestDialog testId="inner" />
      </TestDialog>,
      'inner',
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('inner')).toBeNull());
    expect(screen.getByTestId('outer')).toBeTruthy();
  });

  it('without a toast, Escape closes one dialog, once', async () => {
    const changes: boolean[] = [];
    function Counted() {
      const [open, setOpen] = useState(true);
      return (
        <DialogRoot
          open={open}
          onOpenChange={(next) => {
            changes.push(next);
            setOpen(next);
          }}
        >
          <Dialog.Portal>
            <DialogContent data-testid="test-dialog" aria-describedby={undefined}>
              <Dialog.Title>Export</Dialog.Title>
              <input data-testid="test-dialog-field" />
            </DialogContent>
          </Dialog.Portal>
        </DialogRoot>
      );
    }
    render(<Shell>{<Counted />}</Shell>);
    screen.getByTestId('test-dialog-field').focus();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('test-dialog')).toBeNull());
    expect(changes).toEqual([false]);
  });

  it('a menu opened in the dialog takes the Escape first', async () => {
    render(
      <Shell>
        <TestDialog>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger data-testid="test-menu-button">Kind</DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content data-testid="test-menu">
                <DropdownMenu.Item>Block</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </TestDialog>
      </Shell>,
    );
    const user = userEvent.setup();
    screen.getByTestId('test-menu-button').focus();
    await user.keyboard('{Enter}');
    await screen.findByTestId('test-menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('test-menu')).toBeNull());
    expect(screen.getByTestId('test-dialog')).toBeTruthy();
  });
});
