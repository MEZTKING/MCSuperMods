/**
 * B840 T3: a minimal kit renderer for the 23 nodes of ADR 0137 D3, built on the app's own parts,
 * to size it as a lazy chunk. Throwaway: not wired, not tested, not shipped. Bundled by
 * `scripts/t3-size.mjs` with the app's modules external (they are in the app's chunks already)
 * and once with them included (the upper bound).
 */
import * as Tabs from '@radix-ui/react-tabs';
import { lazy, memo, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { Button } from '../../../../../app/src/renderer/src/components/ui/Button';
import { InMore } from '../../../../../app/src/renderer/src/components/ui/MoreOptions';
import { CheckField, TextField } from '../../../../../app/src/renderer/src/studios/blocks-items/parts';
import { IdField, NumberField, SelectField } from '../../../../../app/src/renderer/src/studios/structures/pickers';
import { Section } from '../../../../../app/src/renderer/src/studios/worldgen/parts';

const BundleLiveView = lazy(() => import('../../../../../app/src/renderer/src/liveviews/BundleLiveView'));

/** One node of a plugin's view tree (viewKit 1). */
export interface KitNode {
  t: string;
  id?: string;
  c?: KitNode[];
  [prop: string]: unknown;
}
/** What the host gives the renderer. */
export interface KitHost {
  /** A user event, sent to the plugin worker (host-held values are already applied). */
  send(event: { node: string; type: 'click' | 'change'; value?: unknown }): void;
  /** The project and element for `LiveView` nodes. */
  liveView?: { project: never; element: (id: string) => never; onSetup(): void };
  /** Opens an approved `https:` link after the line naming its host. */
  openLink(url: string): void;
  /** Attaches a transferred canvas to the plugin worker. */
  attachCanvas(node: string, canvas: OffscreenCanvas): void;
}

const TONES: Record<string, string> = { accent: 'text-accent', muted: 'text-muted', error: 'text-error', warning: 'text-warning' };
const tone = (n: KitNode) => TONES[String(n.tone)] ?? '';
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A field whose value the host holds: it paints at once; the plugin is told after (B840 S1). */
function HostText(props: { node: KitNode; host: KitHost }) {
  const [value, setValue] = useState(str(props.node.value));
  return <TextField label={str(props.node.label)} value={value} testId={`kit-${props.node.id}`} onCommit={(v) => { setValue(v ?? ''); props.host.send({ node: String(props.node.id), type: 'change', value: v }); }} />;
}

function KitCanvas(props: { node: KitNode; host: KitHost }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    props.host.attachCanvas(String(props.node.id), canvas.transferControlToOffscreen());
  }, [props.host, props.node.id]);
  const w = Math.min(1024, Number(props.node.width) || 256);
  const h = Math.min(1024, Number(props.node.height) || 256);
  return <canvas ref={ref} width={w} height={h} aria-label={str(props.node.label)} />;
}

/** `Picture`: the plugin's PNG bytes as a data: URL (img-src allows 'self' and data:, not blob:). */
function KitPicture(props: { node: KitNode }) {
  const bytes = props.node.png;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1_048_576) return;
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result));
    reader.readAsDataURL(new Blob([bytes], { type: 'image/png' }));
  }, [bytes]);
  return url === null ? null : <img src={url} alt={str(props.node.alt)} className="max-w-full [image-rendering:pixelated]" />;
}

export const KitView = memo(function KitView(props: { node: KitNode; host: KitHost }): ReactNode {
  const { node, host } = props;
  const kids = node.c?.map((child, i) => <KitView key={child.id ?? i} node={child} host={host} />);
  const id = String(node.id ?? '');
  switch (node.t) {
    case 'Column': return <div className="flex flex-col gap-2">{kids}</div>;
    case 'Row': return <div className="flex flex-wrap items-end gap-2">{kids}</div>;
    case 'Section': return <Section title={str(node.title)} testId={`kit-${id}`}>{kids}</Section>;
    case 'Heading': return <h3 className="font-semibold">{str(node.text)}</h3>;
    case 'Text': return <p className={`text-sm ${tone(node)}`}>{str(node.text)}</p>;
    case 'Notice': return <p role="status" className={`rounded border border-border p-2 text-sm ${tone(node)}`}>{str(node.text)}</p>;
    case 'Button': return <Button onClick={() => host.send({ node: id, type: 'click' })}>{str(node.label)}</Button>;
    case 'Toggle': return <CheckField label={str(node.label)} checked={node.value === true} onChange={(v) => host.send({ node: id, type: 'change', value: v })} />;
    case 'TextField': return <HostText node={node} host={host} />;
    case 'NumberField': return <NumberField label={str(node.label)} value={node.value as number} onCommit={(v) => host.send({ node: id, type: 'change', value: v })} />;
    case 'Slider': return <label className="flex flex-col text-sm">{str(node.label)}<input type="range" min={Number(node.min)} max={Number(node.max)} step={Number(node.step) || 1} defaultValue={Number(node.value)} onChange={(e) => host.send({ node: id, type: 'change', value: Number(e.target.value) })} /></label>;
    case 'Select': return <SelectField label={str(node.label)} value={str(node.value)} choices={(node.choices as string[]) ?? []} onChange={(v: unknown) => host.send({ node: id, type: 'change', value: v })} />;
    case 'ColourField': return <label className="flex items-center gap-2 text-sm">{str(node.label)}<input type="color" defaultValue={str(node.value) || '#000000'} onChange={(e) => host.send({ node: id, type: 'change', value: e.target.value })} /></label>;
    case 'ThingPicker':
    case 'TexturePicker': return <IdField label={str(node.label)} value={str(node.value)} registry={str(node.registry) || (node.t === 'TexturePicker' ? 'texture' : 'item')} onCommit={(v: string) => host.send({ node: id, type: 'change', value: v })} />;
    case 'List': return <ul className="flex flex-col gap-1">{node.c?.map((child, i) => <li key={child.id ?? i}><KitView node={child} host={host} /></li>)}</ul>;
    case 'Table': return (
      <table className="text-sm"><tbody>{(node.rows as string[][] | undefined)?.slice(0, 500).map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="px-1">{cell}</td>)}</tr>)}</tbody></table>
    );
    case 'Tabs': return (
      <Tabs.Root defaultValue={node.c?.[0]?.id ?? '0'}>
        <Tabs.List className="flex gap-1">{node.c?.map((tab, i) => <Tabs.Trigger key={tab.id ?? i} value={tab.id ?? String(i)}>{str(tab.title)}</Tabs.Trigger>)}</Tabs.List>
        {node.c?.map((tab, i) => <Tabs.Content key={tab.id ?? i} value={tab.id ?? String(i)}><KitView node={{ t: 'Column', c: tab.c ?? [] }} host={host} /></Tabs.Content>)}
      </Tabs.Root>
    );
    case 'Picture': return <KitPicture node={node} />;
    case 'Canvas': return <KitCanvas node={node} host={host} />;
    case 'LiveView': return host.liveView === undefined ? null : (
      <Suspense fallback={<p className="text-muted text-sm">Loading view…</p>}>
        <BundleLiveView project={host.liveView.project} element={host.liveView.element(str(node.element))} onSetup={host.liveView.onSetup} />
      </Suspense>
    );
    case 'MoreOptions': return <InMore>{kids}</InMore>;
    case 'Link': return <button type="button" className="text-accent underline" onClick={() => host.openLink(str(node.url))}>{str(node.label)}</button>;
    default: return <p className="text-error text-sm">This part is not in the kit: {node.t}</p>;
  }
});
