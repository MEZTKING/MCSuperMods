import type { Json, ResourceLocation } from '@msm/core';
import { Dialog } from 'radix-ui';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { type ElementTemplate, templateElementId } from '../studios/templates';
import { Button } from './ui/Button';

export const fieldClass = 'rounded border border-border bg-bg px-2 py-1';

export function Modal(props: {
  title: string;
  error: string | null;
  onCancel(): void;
  onSubmit(): void;
  children: ReactNode;
  /** The submit button's text; default "Add". */
  submitLabel?: string;
  /** Disables the submit button. */
  busy?: boolean;
  testId?: string;
  /** Wider content for pickers. */
  wide?: boolean;
}) {
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    props.onSubmit();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid={props.testId}
          className={`fixed top-1/2 left-1/2 z-50 max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg ${props.wide === true ? 'w-[min(94vw,560px)]' : 'w-[min(90vw,380px)]'}`}
        >
          <form onSubmit={submit} className="flex flex-col gap-1.5">
            <Dialog.Title className="mb-1.5 text-base font-semibold">{props.title}</Dialog.Title>
            {props.children}
            {props.error !== null && (
              <p className="whitespace-pre-line text-error" role="alert">
                {props.error}
              </p>
            )}
            <div className="mt-2 flex gap-1.5">
              <Button
                type="submit"
                disabled={props.busy === true}
                data-testid={props.testId === undefined ? undefined : `${props.testId}-submit`}
              >
                {props.submitLabel ?? 'Add'}
              </Button>
              <Dialog.Close asChild>
                <Button>Cancel</Button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function attempt(action: () => void, setError: (error: string | null) => void): void {
  try {
    action();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

/** Asks for a namespace name. */
export function NewNamespaceDialog(props: { onCancel(): void; onSubmit(name: string): void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  return (
    <Modal
      title="Add namespace"
      error={error}
      onCancel={props.onCancel}
      onSubmit={() => attempt(() => props.onSubmit(name.trim()), setError)}
    >
      <label htmlFor={inputId}>Name</label>
      <input
        id={inputId}
        className={fieldClass}
        value={name}
        placeholder="my_mod"
        onChange={(event) => setName(event.target.value)}
      />
    </Modal>
  );
}

/** What {@link NewElementDialog} submits. */
export interface NewElementInput {
  id: ResourceLocation;
  kind: string;
  data: Json;
}

/**
 * The "New element" template picker: a template (Block model, Item model, Blockstate, …), a
 * namespace and a name. The template sets the id prefix or default name, the starting data
 * and optionally a default namespace (`minecraft` for the tick and load function tags). A
 * namespace the project does not have yet is offered too; the dialog says that creating the
 * element adds it (the session adds it in the same undo step).
 */
export function NewElementDialog(props: {
  namespaces: readonly string[];
  templates: readonly ElementTemplate[];
  /** The `defaultData` of a kind, for templates that start from it. */
  kindDefault(kind: string): Json | undefined;
  onCancel(): void;
  onSubmit(input: NewElementInput): void;
}) {
  const firstNamespace = props.namespaces[0] ?? '';
  const [namespace, setNamespace] = useState(
    props.templates[0]?.defaultNamespace ?? firstNamespace,
  );
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? '');
  const template = props.templates.find((entry) => entry.id === templateId);
  const isNewNamespace = namespace !== '' && !props.namespaces.includes(namespace);
  const namespaceOptions = isNewNamespace ? [...props.namespaces, namespace] : props.namespaces;
  const newNamespaceId = useId();
  const [name, setName] = useState(template?.defaultName ?? '');
  const [error, setError] = useState<string | null>(null);
  const namespaceId = useId();
  const nameId = useId();
  const nameHintId = useId();

  const choose = (next: ElementTemplate): void => {
    if (next.defaultName !== undefined) setName(next.defaultName);
    else if (template?.defaultName !== undefined && name === template.defaultName) setName('');
    if (next.defaultNamespace !== undefined) setNamespace(next.defaultNamespace);
    else if (template?.defaultNamespace !== undefined && namespace === template.defaultNamespace) {
      // Leave the template's namespace again unless the user picked it themselves.
      setNamespace(props.namespaces.includes(namespace) ? namespace : firstNamespace);
    }
    setTemplateId(next.id);
    setError(null);
  };

  let preview = '';
  if (template !== undefined) {
    try {
      preview = templateElementId(template, namespace, name);
    } catch {
      preview = '';
    }
  }

  return (
    <Modal
      title="New element"
      error={error}
      wide
      testId="new-element-dialog"
      submitLabel={isNewNamespace ? 'Add namespace and create' : 'Create'}
      onCancel={props.onCancel}
      onSubmit={() =>
        attempt(() => {
          if (template === undefined) throw new Error('Choose what to create.');
          const id = templateElementId(template, namespace, name);
          props.onSubmit({
            id,
            kind: template.kind,
            data: template.data(id, props.kindDefault(template.kind), {
              namespaces: props.namespaces,
            }),
          });
        }, setError)
      }
    >
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0" data-testid="kind-picker">
        <legend className="mb-1">Template</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {props.templates.map((entry) => (
            <label
              key={entry.id}
              className={
                'flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 ' +
                (entry.id === templateId ? 'border-accent bg-bg' : 'border-border')
              }
            >
              <input
                type="radio"
                name="template"
                value={entry.id}
                className="mt-1"
                data-testid={`template-${entry.id}`}
                checked={entry.id === templateId}
                onChange={() => choose(entry)}
              />
              <span className="flex flex-col">
                <span className="font-medium">{entry.label}</span>
                <span className="text-xs text-muted">{entry.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={namespaceId}>Namespace</label>
      <select
        id={namespaceId}
        data-testid="new-element-namespace"
        aria-describedby={isNewNamespace ? newNamespaceId : undefined}
        className={fieldClass}
        value={namespace}
        onChange={(event) => setNamespace(event.target.value)}
      >
        {namespaceOptions.map((entry) => (
          <option key={entry} value={entry}>
            {props.namespaces.includes(entry) ? entry : `${entry} (new)`}
          </option>
        ))}
      </select>
      {isNewNamespace && (
        <p
          id={newNamespaceId}
          className="text-xs text-warning"
          data-testid="new-element-new-namespace"
        >
          The project has no namespace "{namespace}" yet; creating this element adds it.
        </p>
      )}
      <label htmlFor={nameId}>Name</label>
      <div className="flex items-center gap-1">
        {template !== undefined && template.prefix !== '' && (
          <code className="font-mono text-muted">{template.prefix}</code>
        )}
        <input
          id={nameId}
          data-testid="new-element-name"
          aria-describedby={nameHintId}
          className={`${fieldClass} flex-1`}
          value={template?.fixedName === true ? (template.defaultName ?? '') : name}
          disabled={template?.fixedName === true}
          placeholder="ruby_block"
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <p id={nameHintId} className="text-xs text-muted">
        {preview === ''
          ? 'Lower-case letters, digits, "_", "-", "." and "/".'
          : `Creates ${preview}`}
      </p>
    </Modal>
  );
}
