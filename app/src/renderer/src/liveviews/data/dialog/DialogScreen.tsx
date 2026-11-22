/**
 * A dialog drawn as the screen it becomes (B611; ADR 0120 D6, limit 2L7): the title, the body,
 * the inputs and the buttons where the game puts them (`dialog-layout.ts`, measured on both
 * targets), drawn in MSM's own look. The inputs can be used; a button runs nothing and says
 * what it would do, with the inputs' values filled into a command template. A type MSM cannot
 * draw is named in its place.
 */

import type { Json } from '@msm/plugin-api';
import { Info } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { projectDataFiles } from '../../client';
import {
  type ItemPictureSource,
  itemName,
  resourceFoldersOf,
  useItemPicture,
} from '../../frame/item-picture';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import type { VanillaFolderFiles } from '../../vanilla-data';
import { useLang, useSettled } from '../lines/lang';
import { TextLine } from '../lines/TextLine';
import {
  fillFormat,
  type LangLookup,
  plainText,
  type TextRun,
  textRuns,
} from '../lines/text-component';
import {
  type DialogButton,
  type DialogWidget,
  layoutDialog,
  type Rect,
  SCREEN,
} from './dialog-layout';

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const bare = (type: Json | undefined): string =>
  typeof type === 'string'
    ? type.startsWith('minecraft:')
      ? type.slice('minecraft:'.length)
      : type
    : '';

const withNamespace = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

/** An input's value as the user set it on the screen. */
type InputValue = string | boolean | number;

/** The value a command template gets for an input (`$(key)`). */
function templateValue(widget: DialogWidget, value: InputValue | undefined): string {
  switch (widget.kind) {
    case 'text':
      return typeof value === 'string' ? value : widget.initial;
    case 'checkbox':
      return (typeof value === 'boolean' ? value : widget.initial) ? widget.onTrue : widget.onFalse;
    case 'options': {
      const index = typeof value === 'number' ? value : widget.initial;
      return widget.options[index]?.id ?? '';
    }
    case 'slider':
      return String(typeof value === 'number' ? value : widget.initial);
    default:
      return '';
  }
}

const slash = (command: string): string => (command.startsWith('/') ? command : `/${command}`);

/** What a button would do, in plain words (it runs nothing here). */
export function actionWords(
  action: Json | null,
  values: Readonly<Record<string, string>>,
  afterAction: string,
  lang: LangLookup,
): string {
  const after =
    afterAction === 'none'
      ? ', and keep the dialog open'
      : afterAction === 'wait_for_response'
        ? ', then wait for the server to answer'
        : ', then close the dialog';
  if (action === null || !isRecord(action)) return 'This button would close the dialog.';
  const type = bare(action.type);
  const text = (value: Json | undefined): string => (typeof value === 'string' ? value : '');
  switch (type) {
    case 'open_url':
      return `This button would open the link ${text(action.url)}${after}.`;
    case 'run_command':
      return `This button would run ${slash(text(action.command))}${after}.`;
    case 'suggest_command':
      return `This button would put ${slash(text(action.command))} in the chat box${after}.`;
    case 'change_page':
      return `This button would turn a book to page ${String(action.page ?? '')}${after}.`;
    case 'copy_to_clipboard':
      return `This button would copy “${text(action.value)}” to the clipboard${after}.`;
    case 'show_dialog': {
      const dialog = action.dialog;
      const name =
        typeof dialog === 'string'
          ? dialog
          : isRecord(dialog)
            ? plainText(textRuns(dialog.title, { lang }))
            : 'another dialog';
      return `This button would open the dialog ${name}.`;
    }
    case 'custom':
      return `This button would send “${text(action.id)}” to the server${after}.`;
    case 'dynamic/run_command': {
      const command = text(action.template).replace(/\$\(([a-zA-Z0-9_]+)\)/g, (_, key: string) =>
        Object.hasOwn(values, key) ? (values[key] as string) : `$(${key})`,
      );
      return `This button would run ${slash(command)}${after}.`;
    }
    case 'dynamic/custom': {
      const filled = Object.entries(values)
        .map(([key, value]) => `${key} = ${value}`)
        .join(', ');
      return `This button would send “${text(action.id)}” to the server with ${filled === '' ? 'no inputs' : filled}${after}.`;
    }
    default:
      return `This button does something only the game knows (${type || 'no type'}).`;
  }
}

/** The screen's scale to fit the panel: 1 to 2 screen pixels per GUI pixel, in quarters. */
function useFitScale(ref: RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(1.5);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = element.clientWidth;
      if (width <= 0) return;
      setScale(Math.max(1, Math.min(2, Math.floor((width / SCREEN.width) * 4) / 4)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return scale;
}

const at = (rect: Rect, origin: { x: number; y: number } = { x: 0, y: 0 }): CSSProperties => ({
  position: 'absolute',
  left: rect.x - origin.x,
  top: rect.y - origin.y,
  width: rect.w,
  height: rect.h,
});

const BUTTON =
  'flex items-center justify-center overflow-hidden whitespace-nowrap border border-[#000000] bg-[#6f6f6f] px-1 text-white shadow-[inset_1px_1px_#a8a8a8,inset_-1px_-1px_#3c3c3c] outline-none hover:bg-[#7f8fb8] focus-visible:border-white';

function DialogItem({
  widget,
  source,
}: {
  widget: Extract<DialogWidget, { kind: 'item' }>;
  source: ItemPictureSource;
}) {
  const picture = useItemPicture(widget.id, source);
  return (
    <span
      role="img"
      aria-label={`${itemName(widget.id, null)}${widget.count > 1 ? `, ${widget.count}` : ''}`}
      data-testid="dialog-widget"
      data-kind="item"
      data-type={widget.type}
      className="relative flex items-center justify-center text-[6px] leading-none text-white"
      style={at(widget.rect)}
    >
      {picture !== null ? (
        <img alt="" src={picture} className="size-full [image-rendering:pixelated]" />
      ) : (
        itemName(widget.id, null).slice(0, 4)
      )}
      {widget.decorations && widget.count > 1 && (
        <span className="absolute right-0 bottom-0 text-[8px] font-semibold leading-none">
          {widget.count}
        </span>
      )}
    </span>
  );
}

interface WidgetProps {
  readonly widget: DialogWidget;
  readonly origin: { x: number; y: number };
  readonly values: Readonly<Record<string, InputValue>>;
  setValue(key: string, value: InputValue): void;
  onButton(button: DialogButton): void;
  onInfo(): void;
  readonly source: ItemPictureSource;
}

/** One widget, placed. */
function Widget({
  widget,
  origin,
  values,
  setValue,
  onButton,
  onInfo,
  source,
}: WidgetProps): ReactNode {
  const style = at(widget.rect, origin);
  switch (widget.kind) {
    case 'title':
      return (
        <span data-testid="dialog-title" className="whitespace-nowrap text-white" style={style}>
          <TextLine runs={widget.runs} />
        </span>
      );
    case 'info':
      return (
        <button
          type="button"
          data-testid="dialog-info"
          aria-label="Why this warning sign"
          className={BUTTON}
          style={style}
          onClick={onInfo}
        >
          <Info size={10} aria-hidden />
        </button>
      );
    case 'area':
      return null;
    case 'message':
      return (
        <span
          data-testid="dialog-widget"
          data-kind="message"
          data-type={widget.type}
          className="py-[4px] text-white [overflow-wrap:anywhere]"
          style={{ ...style, textAlign: widget.type === 'item_description' ? 'left' : 'center' }}
        >
          <TextLine runs={widget.runs} />
        </span>
      );
    case 'item':
      return <DialogItem widget={widget} source={source} />;
    case 'label':
      return (
        <span className="whitespace-nowrap text-white" style={style}>
          <TextLine runs={widget.runs} />
        </span>
      );
    case 'text': {
      const value = values[widget.key];
      const props = {
        'data-testid': 'dialog-widget',
        'data-kind': 'text',
        'data-type': widget.type,
        'aria-label': widget.key,
        maxLength: widget.maxLength,
        value: typeof value === 'string' ? value : widget.initial,
        className:
          'resize-none border border-[#a0a0a0] bg-[#000000] px-[4px] text-[8px] leading-[9px] text-white outline-none focus:border-white',
        style,
      };
      return widget.lines > 1 ? (
        <textarea {...props} onChange={(event) => setValue(widget.key, event.target.value)} />
      ) : (
        <input {...props} onChange={(event) => setValue(widget.key, event.target.value)} />
      );
    }
    case 'checkbox': {
      const checked =
        typeof values[widget.key] === 'boolean' ? (values[widget.key] as boolean) : widget.initial;
      return (
        <label
          data-testid="dialog-widget"
          data-kind="checkbox"
          data-type={widget.type}
          className="flex items-center gap-[4px] whitespace-nowrap text-white"
          style={style}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setValue(widget.key, event.target.checked)}
            className="size-[17px] shrink-0 accent-[#7f8fb8]"
          />
          <TextLine runs={widget.label} />
        </label>
      );
    }
    case 'options': {
      const index =
        typeof values[widget.key] === 'number' ? (values[widget.key] as number) : widget.initial;
      const option = widget.options[index];
      const shown = option?.display ?? [];
      return (
        <button
          type="button"
          data-testid="dialog-widget"
          data-kind="options"
          data-type={widget.type}
          data-value={option?.id ?? ''}
          className={BUTTON}
          style={style}
          onClick={() =>
            setValue(
              widget.key,
              widget.options.length === 0 ? 0 : (index + 1) % widget.options.length,
            )
          }
        >
          {widget.label === null ? (
            <TextLine runs={shown} />
          ) : (
            <TextLine runs={[...widget.label, { text: ': ', style: {} }, ...shown]} />
          )}
        </button>
      );
    }
    case 'slider': {
      const value =
        typeof values[widget.key] === 'number' ? (values[widget.key] as number) : widget.initial;
      const runs = fillFormat(
        widget.format,
        [widget.label, [{ text: String(value), style: {} }]],
        {},
      );
      return (
        <label
          data-testid="dialog-widget"
          data-kind="slider"
          data-type={widget.type}
          className="relative flex items-center justify-center border border-[#000000] bg-[#3a3a3a] text-white"
          style={style}
        >
          <input
            type="range"
            min={Math.min(widget.start, widget.end)}
            max={Math.max(widget.start, widget.end)}
            step={widget.step ?? 'any'}
            value={value}
            aria-label={plainText(widget.label)}
            onChange={(event) => setValue(widget.key, Number(event.target.value))}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          <span className="pointer-events-none whitespace-nowrap">
            <TextLine runs={runs} />
          </span>
        </label>
      );
    }
    case 'button': {
      const label = plainText(widget.button.label);
      return (
        <button
          type="button"
          data-testid="dialog-button"
          data-place={widget.place}
          title={widget.button.tooltip === null ? undefined : plainText(widget.button.tooltip)}
          aria-label={label === '' ? 'Button without words' : label}
          className={BUTTON}
          style={style}
          onClick={() => onButton(widget.button)}
        >
          <TextLine runs={widget.button.label} />
        </button>
      );
    }
    case 'unknown':
      return (
        <span
          data-testid="dialog-unknown"
          data-what={widget.what}
          data-type={widget.type}
          className="flex items-center justify-center border border-dashed border-[#ffaa00] text-center text-[#ffaa00]"
          style={style}
        >
          {`Only in the game: ${widget.what === 'dialog' ? 'a dialog' : widget.what === 'body' ? 'a body' : 'an input'} of type ${widget.type}`}
        </span>
      );
  }
}

/** Where vanilla's dialogs and dialog tags stand. */
type VanillaState =
  | { readonly status: 'none' | 'loading' | 'not_set_up' }
  | { readonly status: 'ready'; readonly folders: Readonly<Record<string, VanillaFolderFiles>> };

/** Whether a dialog names a vanilla dialog or a tag (whose members may be vanilla's). */
function namesVanilla(dialog: Json): boolean {
  if (!isRecord(dialog) || bare(dialog.type) !== 'dialog_list') return false;
  const refs = Array.isArray(dialog.dialogs) ? dialog.dialogs : [dialog.dialogs];
  return refs.some(
    (ref) =>
      typeof ref === 'string' &&
      (ref.startsWith('#') || withNamespace(ref).startsWith('minecraft:')),
  );
}

/** The view of `minecraft:dialog`. */
export default function DialogScreen(props: LiveViewProps) {
  const { vanilla, vanillaAssets, onSetup } = props;
  const settled = useSettled(
    useMemo(
      () => ({ project: props.project, element: props.element }),
      [props.project, props.element],
    ),
  );
  const { project, element } = settled;
  const data = element.data as Json;
  const { lookup } = useLang(project, vanillaAssets);
  const wantsVanilla = useMemo(() => namesVanilla(data), [data]);
  const [vanillaState, setVanillaState] = useState<VanillaState>({ status: 'none' });
  useEffect(() => {
    if (!wantsVanilla) {
      setVanillaState({ status: 'none' });
      return;
    }
    let live = true;
    setVanillaState((before) => (before.status === 'ready' ? before : { status: 'loading' }));
    void vanilla.folders(['dialog', 'tags/dialog']).then(
      (answer) => {
        if (live)
          setVanillaState(
            answer.status === 'ready'
              ? { status: 'ready', folders: answer.folders }
              : { status: 'not_set_up' },
          );
      },
      () => {
        if (live) setVanillaState({ status: 'not_set_up' });
      },
    );
    return () => {
      live = false;
    };
  }, [wantsVanilla, vanilla]);

  const own = useMemo(() => projectDataFiles(project, ['dialog', 'tags/dialog']), [project]);
  const { layout, notFound } = useMemo(() => {
    const missing: string[] = [];
    const vanillaFolders = vanillaState.status === 'ready' ? vanillaState.folders : null;
    const fileOf = (folder: string, id: string): Json | undefined => {
      const key = withNamespace(id);
      return own[folder]?.[key] ?? vanillaFolders?.[folder]?.[key];
    };
    const titleOf = (dialog: Json): TextRun[] =>
      isRecord(dialog) ? textRuns(dialog.external_title ?? dialog.title, { lang: lookup }) : [];
    const resolve = (ref: Json, seen: Set<string>): { title: readonly TextRun[] }[] => {
      if (isRecord(ref)) return [{ title: titleOf(ref) }];
      if (typeof ref !== 'string') return [];
      if (ref.startsWith('#')) {
        const id = withNamespace(ref.slice(1));
        if (seen.has(id)) return [];
        seen.add(id);
        const tag = fileOf('tags/dialog', id);
        if (!isRecord(tag) || !Array.isArray(tag.values)) {
          missing.push(ref);
          return [];
        }
        return tag.values.flatMap((entry) =>
          resolve(
            typeof entry === 'string'
              ? entry
              : isRecord(entry) && typeof entry.id === 'string'
                ? entry.id
                : '',
            seen,
          ),
        );
      }
      const dialog = fileOf('dialog', ref);
      if (dialog === undefined) {
        missing.push(ref);
        return [{ title: [{ text: ref, style: {} }] }];
      }
      return [{ title: titleOf(dialog) }];
    };
    return {
      layout: layoutDialog(data, { lang: lookup, resolveDialog: (ref) => resolve(ref, new Set()) }),
      notFound: missing,
    };
  }, [data, lookup, own, vanillaState]);

  const [values, setValues] = useState<Record<string, InputValue>>({});
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    setValues({});
    setSaid(null);
  }, [element.id]);
  const holder = useRef<HTMLDivElement | null>(null);
  const scale = useFitScale(holder);
  const source: ItemPictureSource = useMemo(
    () => ({ vanillaAssets, folders: resourceFoldersOf(project) }),
    [vanillaAssets, project],
  );

  const record = isRecord(data) ? data : {};
  const afterAction = typeof record.after_action === 'string' ? record.after_action : 'close';
  const templateValues = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const widget of layout.widgets) {
      if ('key' in widget && typeof widget.key === 'string' && widget.key !== '') {
        out[widget.key] = templateValue(widget, values[widget.key]);
      }
    }
    return out;
  };
  const area = layout.widgets.find((widget) => widget.kind === 'area')?.rect ?? {
    x: 0,
    y: 63,
    w: 0,
    h: 0,
  };
  const inArea = (widget: DialogWidget): boolean =>
    widget.kind !== 'title' &&
    widget.kind !== 'info' &&
    widget.kind !== 'area' &&
    !(widget.kind === 'button' && widget.place === 'footer');
  const widgetProps = {
    values,
    setValue: (key: string, value: InputValue) =>
      setValues((before) => ({ ...before, [key]: value })),
    onButton: (button: DialogButton) =>
      setSaid(actionWords(button.action, templateValues(), afterAction, lookup)),
    onInfo: () =>
      setSaid(
        'In the game this sign warns that a data pack or the server made this screen, not the game itself.',
      ),
    source,
  };

  const unknownActions = layout.unknown.filter((part) => part.what === 'action');
  const notes = [
    'Drawn by MSM in the places the game puts each part; the game’s look, font and spacing differ a little.',
    'Buttons run nothing here: each says what it would do. Play is the real check.',
    ...(layout.serverLinks
      ? ['A server links dialog shows the links of the server you play on; MSM has none to show.']
      : []),
    ...(record.pause !== false ? ['In single player it pauses the game while it is open.'] : []),
    ...(record.can_close_with_escape === false
      ? ['Esc does not close it: a button must.']
      : ['Esc closes it.']),
    ...unknownActions.map((part) => `A button does something only the game knows (${part.type}).`),
    ...(notFound.length > 0 && vanillaState.status !== 'not_set_up'
      ? [`Not found, so shown by name: ${[...new Set(notFound)].join(', ')}.`]
      : []),
  ];

  return (
    <LiveViewFrame
      title="Dialog"
      fidelity="about_right"
      notes={notes}
      needsSetUp={needsSetUpBanner(
        vanillaState.status === 'not_set_up'
          ? 'not_set_up'
          : vanillaState.status === 'ready'
            ? 'ready'
            : null,
        wantsVanilla,
      )}
      onSetup={onSetup}
    >
      <div className="flex flex-col gap-2">
        <div ref={holder} className="w-full max-w-full overflow-auto">
          <div style={{ width: SCREEN.width * scale, height: SCREEN.height * scale }}>
            <div
              data-testid="dialog-screen"
              data-type={layout.type}
              className="relative overflow-hidden rounded-sm font-mono text-[8px] leading-[9px]"
              style={{
                width: SCREEN.width,
                height: SCREEN.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                background: 'linear-gradient(#1a1a26, #0c0c12)',
              }}
            >
              {layout.widgets
                .filter((widget) => !inArea(widget))
                .map((widget, index) => (
                  <Widget
                    // Widgets are placed once per layout; their order is their identity.
                    key={index}
                    widget={widget}
                    origin={{ x: 0, y: 0 }}
                    {...widgetProps}
                  />
                ))}
              <div
                data-testid="dialog-area"
                data-scrolls={layout.contentHeight > area.h}
                className="overflow-y-auto overflow-x-hidden"
                style={at(area)}
              >
                <div className="relative" style={{ height: layout.contentHeight }}>
                  {layout.widgets.filter(inArea).map((widget, index) => (
                    <Widget
                      // Widgets are placed once per layout; their order is their identity.
                      key={index}
                      widget={widget}
                      origin={{ x: area.x, y: area.y }}
                      {...widgetProps}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <p
          role="status"
          aria-live="polite"
          data-testid="dialog-said"
          className="min-h-5 text-sm [overflow-wrap:anywhere]"
        >
          {said ?? 'Press a button to see what it would do.'}
        </p>
      </div>
    </LiveViewFrame>
  );
}
