/**
 * MSM's dialog layout against the widgets the real client showed for MSM's own fixture dialogs
 * (B600 2S9, `docs/reference/spikes/b600/results/client-*.json`, both targets): every widget's
 * rectangle in GUI pixels at 427 by 240.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  type DialogWidget,
  layoutDialog,
  type Rect,
  textWidth,
  wrapLines,
} from '../../../../src/renderer/src/liveviews/data/dialog/dialog-layout';
import { textRuns } from '../../../../src/renderer/src/liveviews/data/lines/text-component';

const RESULTS = join(__dirname, '../../../../../docs/reference/spikes/b600/results');
const NS = 'msm_b600';

/** The spike's fixture dialogs (`spike-src/make_pack.py`, MSM's own files). */
const body: Json[] = [
  { type: 'minecraft:plain_message', contents: 'A plain message body of a few words.', width: 200 },
  {
    type: 'minecraft:item',
    item: { id: 'minecraft:diamond', count: 3 },
    description: 'Three diamonds',
    show_decorations: true,
    show_tooltip: true,
  },
];
const inputs: Json[] = [
  {
    type: 'minecraft:text',
    key: 'name',
    label: 'Name',
    width: 200,
    initial: 'Ann',
    max_length: 32,
  },
  { type: 'minecraft:boolean', key: 'ok', label: 'Agree', initial: true },
  {
    type: 'minecraft:single_option',
    key: 'pick',
    label: 'Pick',
    options: ['one', { id: 'two', display: 'Two', initial: true }],
  },
  {
    type: 'minecraft:number_range',
    key: 'n',
    label: 'How many',
    start: 0,
    end: 10,
    step: 1,
    initial: 5,
  },
];
const btn = (label: string, width = 150): Json => ({
  label,
  width,
  action: { type: 'minecraft:run_command', command: 'say hi' },
});

const FIXTURE_DIALOGS: Record<string, Json> = {
  notice: { type: 'minecraft:notice', title: 'Notice', body, inputs, action: btn('OK') },
  confirmation: {
    type: 'minecraft:confirmation',
    title: 'Confirm',
    body: body[0] as Json,
    yes: btn('Yes'),
    no: btn('No'),
  },
  multi_action: {
    type: 'minecraft:multi_action',
    title: 'Many',
    body: body[0] as Json,
    columns: 2,
    actions: [btn('One'), btn('Two'), btn('Three'), btn('Four', 100), btn('Five', 300)],
    exit_action: { label: 'Back', width: 200 },
  },
  dialog_list: {
    type: 'minecraft:dialog_list',
    title: 'List',
    dialogs: [`${NS}:notice`, `${NS}:confirmation`],
    columns: 1,
    button_width: 200,
    exit_action: { label: 'Back' },
  },
  server_links: { type: 'minecraft:server_links', title: 'Links', columns: 2, button_width: 150 },
  plain: { type: 'minecraft:notice', title: 'Plain' },
};

const lang = (key: string): string | undefined => (key === 'gui.ok' ? 'Done' : undefined);

function layout(name: string) {
  return layoutDialog(FIXTURE_DIALOGS[name] as Json, {
    lang,
    resolveDialog: (ref) => {
      const id = typeof ref === 'string' ? ref.slice(ref.indexOf(':') + 1) : '';
      const dialog = FIXTURE_DIALOGS[id] as { title?: Json } | undefined;
      return dialog === undefined ? [] : [{ title: textRuns(dialog.title, { lang }) }];
    },
  });
}

/** The game's widget classes as MSM's widget kinds. */
const KIND: Record<string, DialogWidget['kind']> = {
  StringWidget: 'title',
  ImageButton: 'info',
  Container: 'area',
  FocusableTextWidget: 'message',
  ItemDisplayWidget: 'item',
  EditBox: 'text',
  Checkbox: 'checkbox',
  CycleButton: 'options',
  SliderImpl: 'slider',
  Plain: 'button',
};

const rectOf = (text: string): Rect => {
  const [xy, wh] = text.split(' ') as [string, string];
  const [x, y] = xy.split(',').map(Number) as [number, number];
  const [w, h] = wh.split('x').map(Number) as [number, number];
  return { x, y, w, h };
};

interface Seen {
  class: string;
  depth: number;
  rect: string;
}

/** The game's widgets of one fixture dialog, as kinds and rectangles. */
function observed(version: string, name: string): { kind: string; rect: Rect }[] {
  const all = JSON.parse(readFileSync(join(RESULTS, `client-${version}.json`), 'utf8')) as Record<
    string,
    { widgets: Seen[] }
  >;
  const widgets = all[`dialog.${name}`]?.widgets ?? [];
  return widgets.map((widget) => {
    let kind = KIND[widget.class] ?? widget.class;
    // An input's label is a StringWidget inside the scrolling area.
    if (widget.class === 'StringWidget' && widget.depth > 0) kind = 'label';
    return { kind, rect: rectOf(widget.rect) };
  });
}

const key = (entry: { kind: string; rect: Rect }) =>
  `${entry.kind} ${entry.rect.x},${entry.rect.y} ${entry.rect.w}x${entry.rect.h}`;

describe('the dialog screen layout (B611, against B600 2S9)', () => {
  for (const version of ['26.3', '26.4-alpha.7']) {
    for (const name of Object.keys(FIXTURE_DIALOGS)) {
      it(`places every widget of ${name} as the client did on ${version}`, () => {
        const ours = layout(name).widgets.map((widget) =>
          key({ kind: widget.kind, rect: widget.rect }),
        );
        const theirs = observed(version, name).map(key);
        expect(theirs.length).toBeGreaterThan(0);
        expect([...ours].sort()).toEqual([...theirs].sort());
      });
    }
  }

  it('estimates the font as the titles measured', () => {
    expect(textWidth('Confirm')).toBe(37);
    expect(textWidth('List')).toBe(18);
    expect(textWidth('Links')).toBe(25);
    expect(wrapLines('A plain message body of a few words.', 200)).toHaveLength(1);
    expect(
      wrapLines('one two three four five six seven eight nine ten eleven twelve', 100).length,
    ).toBeGreaterThan(1);
  });

  it('names a body, an input or a dialog type it cannot draw', () => {
    const result = layoutDialog(
      {
        type: 'minecraft:notice',
        title: 'X',
        body: { type: 'minecraft:made_up_body' },
        inputs: [{ type: 'minecraft:made_up_input', key: 'k', label: 'K' }],
        action: { label: 'Go', action: { type: 'minecraft:made_up_action' } },
      },
      { lang: () => undefined, resolveDialog: () => [] },
    );
    expect(result.unknown.map((part) => `${part.what}:${part.type}`)).toEqual([
      'body:made_up_body',
      'input:made_up_input',
      'action:made_up_action',
    ]);
    expect(
      layoutDialog({ type: 'made_up' }, { lang: () => undefined, resolveDialog: () => [] }).unknown,
    ).toEqual([{ what: 'dialog', type: 'made_up', path: 'type' }]);
  });
});
