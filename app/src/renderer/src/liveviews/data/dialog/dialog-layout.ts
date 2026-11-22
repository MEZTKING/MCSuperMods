/**
 * Where a dialog's widgets sit, in GUI pixels on a 427 by 240 screen (GUI scale 2 of 854 by
 * 480), from the proportions the real client showed for MSM's own fixture dialogs on both
 * targets (B600 2S9, by observation only; no game code read): the title centred at y 13 with
 * the info button 10 pixels to its right at y 7; the body and inputs one under another, 10
 * apart, from y 63 (from y 33 in a scrolling area when too tall, ending 33 above the bottom),
 * each centred in a column as wide as the widest; button grids 2 apart, rows 22 apart, a short
 * last row centred; the footer at the height less 26. Text widths are MSM's estimate of the
 * game's font (about right).
 */

import type { Json } from '@msm/plugin-api';
import { type LangLookup, plainText, type TextRun, textRuns } from '../lines/text-component';

/** The screen in GUI pixels. */
export const SCREEN = Object.freeze({ width: 427, height: 240 });

/** A rectangle in GUI pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A button of the data (`label`, `tooltip`, `width`, `action`). */
export interface DialogButton {
  readonly label: readonly TextRun[];
  readonly tooltip: readonly TextRun[] | null;
  /** The click action object, or `null` for none. */
  readonly action: Readonly<Record<string, Json>> | null;
}

/** One widget of the screen. */
export type DialogWidget =
  | { readonly kind: 'title'; readonly rect: Rect; readonly runs: readonly TextRun[] }
  | { readonly kind: 'info'; readonly rect: Rect }
  | { readonly kind: 'area'; readonly rect: Rect; readonly scrolls: boolean }
  | {
      readonly kind: 'message';
      readonly rect: Rect;
      readonly runs: readonly TextRun[];
      readonly type: string;
    }
  | {
      readonly kind: 'item';
      readonly rect: Rect;
      readonly id: string;
      readonly count: number;
      readonly decorations: boolean;
      readonly tooltip: boolean;
      readonly type: string;
    }
  | { readonly kind: 'label'; readonly rect: Rect; readonly runs: readonly TextRun[] }
  | {
      readonly kind: 'text';
      readonly rect: Rect;
      readonly key: string;
      readonly initial: string;
      readonly maxLength: number;
      readonly lines: number;
      readonly type: string;
    }
  | {
      readonly kind: 'checkbox';
      readonly rect: Rect;
      readonly key: string;
      readonly label: readonly TextRun[];
      readonly initial: boolean;
      readonly onTrue: string;
      readonly onFalse: string;
      readonly type: string;
    }
  | {
      readonly kind: 'options';
      readonly rect: Rect;
      readonly key: string;
      readonly label: readonly TextRun[] | null;
      readonly options: readonly { readonly id: string; readonly display: readonly TextRun[] }[];
      readonly initial: number;
      readonly type: string;
    }
  | {
      readonly kind: 'slider';
      readonly rect: Rect;
      readonly key: string;
      readonly label: readonly TextRun[];
      readonly format: string;
      readonly start: number;
      readonly end: number;
      readonly step: number | null;
      readonly initial: number;
      readonly type: string;
    }
  | {
      readonly kind: 'button';
      readonly rect: Rect;
      readonly button: DialogButton;
      /** In the scrolling area or in the footer. */
      readonly place: 'body' | 'footer';
    }
  | {
      readonly kind: 'unknown';
      readonly rect: Rect;
      /** What it is: a body, an input or a whole dialog type. */
      readonly what: 'body' | 'input' | 'dialog';
      readonly type: string;
    };

/** What the layout could not draw, named. */
export interface DialogUnknown {
  readonly what: 'body' | 'input' | 'dialog' | 'action';
  readonly type: string;
  readonly path: string;
}

/** A laid out dialog. */
export interface DialogLayout {
  readonly type: string;
  readonly widgets: readonly DialogWidget[];
  readonly unknown: readonly DialogUnknown[];
  /** Server links are the server's own; MSM has none to show. */
  readonly serverLinks: boolean;
  /** The height of everything in the scrolling area (more than the area's when it scrolls). */
  readonly contentHeight: number;
}

/** What the layout needs besides the dialog. */
export interface DialogLayoutContext {
  readonly lang: LangLookup;
  /** The title a `dialog_list` button shows for a dialog it names (id, `#tag` or inline). */
  resolveDialog(ref: Json): readonly { readonly title: readonly TextRun[] }[];
}

/** The types MSM draws (the game's `dialog_type`, `dialog_body_type`, `input_control_type`). */
export const DRAWN_TYPES = Object.freeze({
  dialog: ['notice', 'confirmation', 'multi_action', 'dialog_list', 'server_links'],
  body: ['plain_message', 'item'],
  input: ['text', 'boolean', 'single_option', 'number_range'],
});

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const bare = (type: Json | undefined): string =>
  typeof type === 'string'
    ? type.startsWith('minecraft:')
      ? type.slice('minecraft:'.length)
      : type
    : '';

/** MSM's estimate of a character's advance in the game's font, in GUI pixels. */
function advance(char: string): number {
  switch (char) {
    case 'i':
    case '.':
    case ',':
    case ':':
    case ';':
    case '!':
    case '|':
    case "'":
      return 2;
    case 'l':
    case '`':
      return 3;
    case 't':
    case 'I':
    case ' ':
    case '(':
    case ')':
    case '[':
    case ']':
    case '{':
    case '}':
    case '"':
    case '*':
      return 4;
    case 'f':
    case 'k':
    case '<':
    case '>':
      return 5;
    case '@':
    case '~':
      return 7;
    default:
      return 6;
  }
}

/** A text's width in GUI pixels (bold adds one a character), MSM's estimate. */
export function textWidth(runs: readonly TextRun[] | string): number {
  const list = typeof runs === 'string' ? [{ text: runs, style: {} }] : runs;
  let width = 0;
  for (const run of list) {
    for (const char of run.text) width += advance(char) + (run.style.bold === true ? 1 : 0);
  }
  return width;
}

/** Lines of `text` wrapped at `width`, word by word. */
export function wrapLines(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`;
      if (line !== '' && textWidth(next) > width) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/** A plain message's height: nine pixels a line and four above and below. */
const messageHeight = (runs: readonly TextRun[], width: number): number =>
  wrapLines(plainText(runs), width).length * 9 + 8;

const intOr = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;

const numOr = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** A button of the data, with the width the game gives one without `width`. */
function readButton(
  value: Json | undefined,
  lang: LangLookup,
  defaultLabel: Json,
  defaultWidth = 150,
): { button: DialogButton; width: number } {
  const record = isRecord(value) ? value : {};
  return {
    button: {
      label: textRuns(record.label ?? defaultLabel, { lang }),
      tooltip: record.tooltip === undefined ? null : textRuns(record.tooltip, { lang }),
      action: isRecord(record.action) ? record.action : null,
    },
    width: intOr(record.width, defaultWidth),
  };
}

/** A piece of the content column before it is placed: its size and how to place it. */
interface Piece {
  readonly w: number;
  readonly h: number;
  place(x: number, y: number, columnX: number, columnW: number): DialogWidget[];
}

const asList = (value: Json | undefined): Json[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function bodyPiece(
  body: Json,
  index: number,
  ctx: DialogLayoutContext,
  unknown: DialogUnknown[],
): Piece {
  const record = isRecord(body) ? body : {};
  const type = bare(record.type);
  if (type === 'plain_message') {
    const w = intOr(record.width, 200);
    const runs = textRuns(record.contents, { lang: ctx.lang });
    const h = messageHeight(runs, w);
    return { w, h, place: (x, y) => [{ kind: 'message', rect: { x, y, w, h }, runs, type }] };
  }
  if (type === 'item') {
    const item = isRecord(record.item) ? record.item : {};
    const id = typeof item.id === 'string' ? item.id : 'minecraft:air';
    const count = intOr(item.count, 1);
    const iw = intOr(record.width, 16);
    const ih = intOr(record.height, 16);
    const description = record.description;
    const message =
      description === undefined
        ? null
        : isRecord(description) && bare(description.type) === 'plain_message'
          ? {
              runs: textRuns(description.contents, { lang: ctx.lang }),
              w: intOr(description.width, 200),
            }
          : { runs: textRuns(description, { lang: ctx.lang }), w: 200 };
    const mh = message === null ? 0 : messageHeight(message.runs, message.w);
    const w = iw + (message === null ? 0 : 2 + message.w);
    const h = Math.max(ih, mh);
    return {
      w,
      h,
      place: (x, y) => {
        const out: DialogWidget[] = [
          {
            kind: 'item',
            rect: { x, y: y + Math.ceil((h - ih) / 2), w: iw, h: ih },
            id,
            count,
            decorations: record.show_decorations !== false,
            tooltip: record.show_tooltip !== false,
            type,
          },
        ];
        if (message !== null) {
          out.push({
            kind: 'message',
            rect: { x: x + iw + 2, y: y + Math.ceil((h - mh) / 2), w: message.w, h: mh },
            runs: message.runs,
            type: 'item_description',
          });
        }
        return out;
      },
    };
  }
  unknown.push({ what: 'body', type: type || '(no type)', path: `body[${index}]` });
  return {
    w: 200,
    h: 17,
    place: (x, y) => [
      { kind: 'unknown', rect: { x, y, w: 200, h: 17 }, what: 'body', type: type || '(no type)' },
    ],
  };
}

function inputPiece(
  input: Json,
  index: number,
  ctx: DialogLayoutContext,
  unknown: DialogUnknown[],
): Piece {
  const record = isRecord(input) ? input : {};
  const type = bare(record.type);
  const key = typeof record.key === 'string' ? record.key : '';
  const label = textRuns(record.label, { lang: ctx.lang });
  const labelVisible = record.label_visible !== false;
  if (type === 'text') {
    const w = intOr(record.width, 200);
    const multiline = isRecord(record.multiline) ? record.multiline : null;
    const lines = multiline === null ? 1 : intOr(multiline.max_lines, 4);
    const boxH = multiline === null ? 20 : intOr(multiline.height, lines * 9 + 8);
    const top = labelVisible ? 13 : 0;
    return {
      w,
      h: top + boxH,
      place: (x, y) => [
        ...(labelVisible
          ? [{ kind: 'label' as const, rect: { x, y, w: textWidth(label), h: 9 }, runs: label }]
          : []),
        {
          kind: 'text',
          rect: { x, y: y + top, w, h: boxH },
          key,
          initial: typeof record.initial === 'string' ? record.initial : '',
          maxLength: intOr(record.max_length, 32),
          lines,
          type,
        },
      ],
    };
  }
  if (type === 'boolean') {
    const w = 17 + 4 + textWidth(label);
    return {
      w,
      h: 17,
      place: (x, y) => [
        {
          kind: 'checkbox',
          rect: { x, y, w, h: 17 },
          key,
          label,
          initial: record.initial === true,
          onTrue: typeof record.on_true === 'string' ? record.on_true : 'true',
          onFalse: typeof record.on_false === 'string' ? record.on_false : 'false',
          type,
        },
      ],
    };
  }
  if (type === 'single_option') {
    const w = intOr(record.width, 200);
    const options = (Array.isArray(record.options) ? record.options : []).map((option) =>
      typeof option === 'string'
        ? { id: option, display: textRuns(option, { lang: ctx.lang }), initial: false }
        : isRecord(option)
          ? {
              id: typeof option.id === 'string' ? option.id : '',
              display: textRuns(option.display ?? option.id, { lang: ctx.lang }),
              initial: option.initial === true,
            }
          : { id: '', display: [], initial: false },
    );
    const initial = Math.max(
      0,
      options.findIndex((option) => option.initial),
    );
    return {
      w,
      h: 20,
      place: (x, y) => [
        {
          kind: 'options',
          rect: { x, y, w, h: 20 },
          key,
          label: labelVisible ? label : null,
          options: options.map(({ id, display }) => ({ id, display })),
          initial,
          type,
        },
      ],
    };
  }
  if (type === 'number_range') {
    const w = intOr(record.width, 200);
    const start = numOr(record.start, 0);
    const end = numOr(record.end, 1);
    const step = typeof record.step === 'number' && record.step > 0 ? record.step : null;
    const middle = (start + end) / 2;
    const initial = numOr(record.initial, middle);
    const formatKey =
      typeof record.label_format === 'string' ? record.label_format : 'options.generic_value';
    return {
      w,
      h: 20,
      place: (x, y) => [
        {
          kind: 'slider',
          rect: { x, y, w, h: 20 },
          key,
          label,
          format: ctx.lang(formatKey) ?? '%s: %s',
          start,
          end,
          step,
          initial,
          type,
        },
      ],
    };
  }
  unknown.push({ what: 'input', type: type || '(no type)', path: `inputs[${index}]` });
  return {
    w: 200,
    h: 20,
    place: (x, y) => [
      { kind: 'unknown', rect: { x, y, w: 200, h: 20 }, what: 'input', type: type || '(no type)' },
    ],
  };
}

/** A grid of buttons: full rows in columns as wide as their widest, a short last row centred. */
function gridPiece(
  buttons: readonly { button: DialogButton; width: number }[],
  columns: number,
): Piece | null {
  if (buttons.length === 0) return null;
  const cols = Math.max(1, columns);
  const fullRows = Math.floor(buttons.length / cols);
  const rest = buttons.slice(fullRows * cols);
  const colW: number[] = [];
  for (let row = 0; row < fullRows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const entry = buttons[row * cols + col];
      if (entry !== undefined) colW[col] = Math.max(colW[col] ?? 0, entry.width);
    }
  }
  const fullW = fullRows === 0 ? 0 : colW.reduce((sum, w) => sum + w, 0) + 2 * (cols - 1);
  const restW =
    rest.length === 0
      ? 0
      : rest.reduce((sum, entry) => sum + entry.width, 0) + 2 * (rest.length - 1);
  const rows = fullRows + (rest.length > 0 ? 1 : 0);
  const w = Math.max(fullW, restW);
  const h = rows * 20 + (rows - 1) * 2;
  return {
    w,
    h,
    place: (_x, y, columnX, columnW) => {
      const out: DialogWidget[] = [];
      const gridX = columnX + Math.floor((columnW - fullW) / 2);
      for (let row = 0; row < fullRows; row += 1) {
        let cellX = gridX;
        for (let col = 0; col < cols; col += 1) {
          const entry = buttons[row * cols + col];
          const cw = colW[col] ?? 0;
          if (entry !== undefined) {
            out.push({
              kind: 'button',
              rect: {
                x: cellX + Math.floor((cw - entry.width) / 2),
                y: y + row * 22,
                w: entry.width,
                h: 20,
              },
              button: entry.button,
              place: 'body',
            });
          }
          cellX += cw + 2;
        }
      }
      let restX = columnX + Math.floor((columnW - restW) / 2);
      for (const entry of rest) {
        out.push({
          kind: 'button',
          rect: { x: restX, y: y + fullRows * 22, w: entry.width, h: 20 },
          button: entry.button,
          place: 'body',
        });
        restX += entry.width + 2;
      }
      return out;
    },
  };
}

/** Lays a dialog out (see the module comment). */
export function layoutDialog(dialog: Json, ctx: DialogLayoutContext): DialogLayout {
  const record = isRecord(dialog) ? dialog : {};
  const type = bare(record.type);
  const unknown: DialogUnknown[] = [];
  const widgets: DialogWidget[] = [];
  const { width: W, height: H } = SCREEN;

  // The title and the info button, centred together.
  const title = textRuns(record.title, { lang: ctx.lang });
  const titleW = textWidth(title);
  const titleX = Math.floor((W - (titleW + 10 + 20)) / 2);
  widgets.push({ kind: 'title', rect: { x: titleX, y: 13, w: titleW, h: 9 }, runs: title });
  widgets.push({ kind: 'info', rect: { x: titleX + titleW + 10, y: 7, w: 20, h: 20 } });

  const pieces: Piece[] = [];
  asList(record.body).forEach((body, index) => {
    pieces.push(bodyPiece(body, index, ctx, unknown));
  });
  (Array.isArray(record.inputs) ? record.inputs : []).forEach((input, index) => {
    pieces.push(inputPiece(input, index, ctx, unknown));
  });

  const footer: { button: DialogButton; width: number }[] = [];
  let footerGap = 0;
  const columns = intOr(record.columns, 2);
  const exit =
    record.exit_action === undefined ? null : readButton(record.exit_action, ctx.lang, '');
  switch (type) {
    case 'notice':
      footer.push(readButton(record.action, ctx.lang, { translate: 'gui.ok', fallback: 'OK' }));
      break;
    case 'confirmation':
      footer.push(readButton(record.yes, ctx.lang, { translate: 'gui.yes', fallback: 'Yes' }));
      footer.push(readButton(record.no, ctx.lang, { translate: 'gui.no', fallback: 'No' }));
      footerGap = 8;
      break;
    case 'multi_action': {
      const actions = (Array.isArray(record.actions) ? record.actions : []).map((action) =>
        readButton(action, ctx.lang, ''),
      );
      const grid = gridPiece(actions, columns);
      if (grid !== null) pieces.push(grid);
      if (exit !== null) footer.push(exit);
      break;
    }
    case 'dialog_list': {
      const width = intOr(record.button_width, 150);
      const buttons = asList(record.dialogs).flatMap((ref) =>
        ctx.resolveDialog(ref).map((entry) => ({
          button: {
            label: entry.title,
            tooltip: null,
            action: { type: 'minecraft:show_dialog', dialog: ref },
          },
          width,
        })),
      );
      const grid = gridPiece(buttons, columns);
      if (grid !== null) pieces.push(grid);
      if (exit !== null) footer.push(exit);
      break;
    }
    case 'server_links':
      if (exit !== null) footer.push(exit);
      break;
    default:
      unknown.push({ what: 'dialog', type: type || '(no type)', path: 'type' });
      pieces.push({
        w: 200,
        h: 20,
        place: (x, y) => [
          {
            kind: 'unknown',
            rect: { x, y, w: 200, h: 20 },
            what: 'dialog',
            type: type || '(no type)',
          },
        ],
      });
  }

  // The content column: as wide as the widest piece, pieces 10 apart.
  const contentW = pieces.reduce((most, piece) => Math.max(most, piece.w), 0);
  const contentH =
    pieces.reduce((sum, piece) => sum + piece.h, 0) + 10 * Math.max(0, pieces.length - 1);
  const areaW = contentW + 20;
  const areaX = Math.floor((W - areaW) / 2);
  const bottom = H - 33;
  const top = 63 + contentH <= bottom ? 63 : 33;
  const areaH = Math.min(contentH, bottom - top);
  widgets.push({
    kind: 'area',
    rect: { x: areaX, y: top, w: areaW, h: areaH },
    scrolls: contentH > areaH,
  });
  const columnX = areaX + 10;
  let y = top;
  for (const piece of pieces) {
    widgets.push(
      ...piece.place(columnX + Math.floor((contentW - piece.w) / 2), y, columnX, contentW),
    );
    y += piece.h + 10;
  }

  // The footer row, centred.
  const footerW =
    footer.reduce((sum, entry) => sum + entry.width, 0) +
    footerGap * Math.max(0, footer.length - 1);
  let footerX = Math.floor((W - footerW) / 2);
  for (const entry of footer) {
    widgets.push({
      kind: 'button',
      rect: { x: footerX, y: H - 26, w: entry.width, h: 20 },
      button: entry.button,
      place: 'footer',
    });
    footerX += entry.width + footerGap;
  }

  for (const widget of widgets) {
    if (widget.kind !== 'button') continue;
    const action = widget.button.action;
    const actionType = action === null ? '' : bare(action.type);
    if (action !== null && !ACTION_TYPES.includes(actionType)) {
      unknown.push({ what: 'action', type: actionType || '(no type)', path: 'button' });
    }
  }
  return { type, widgets, unknown, serverLinks: type === 'server_links', contentHeight: contentH };
}

/** The click actions MSM can say in words (the game's `dialog_action_type`). */
export const ACTION_TYPES: readonly string[] = [
  'open_url',
  'run_command',
  'suggest_command',
  'change_page',
  'copy_to_clipboard',
  'show_dialog',
  'custom',
  'dynamic/run_command',
  'dynamic/custom',
];
