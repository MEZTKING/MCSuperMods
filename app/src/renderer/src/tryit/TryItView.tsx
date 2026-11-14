/**
 * Try it's view (ADR 0085 D4, D7, D12, D13; B390): the strip "Preview, not the real game." with
 * the Play button, the first-run card, the test area's picture with a crosshair and the hotbar,
 * the picker, the tools (Grow, Power, Clear the area), the clock, the log with its "Only in
 * Minecraft:" lines, the keys list and the hidden state readout.
 *
 * The view lowers the open project through {@link SessionFiles} while it is shown and keeps one
 * {@link TryItArea} in the Try it store, so the area survives a trip to a Studio and back. Every
 * mouse action has a key (`input.ts`). The labels are the same words in every mode (ADR 0083 D7:
 * "picture", "mob", seconds).
 *
 * This module is a lazy chunk: the shell imports it with `lazy()`.
 */

import { type BlockState, type PointedAt, SIM_TOOLS, type SimLogLine } from '@msm/sim';
import { Box, Egg, Hand, Pause, Play, StepForward, X } from 'lucide-react';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button } from '../components/ui/Button';
import type { ResourceFolders, VanillaAssetReader } from '../preview/model-chain';
import {
  hotbarSlots,
  projectThings,
  propIds,
  propThing,
  type TryItThing,
  texturePath,
} from './hotbar';
import {
  commandForButton,
  commandForKey,
  inputFromHeld,
  isDoubleTap,
  MOUSE_DEGREES_PER_PIXEL,
  MOVEMENT_CODES,
  TRYIT_KEYS,
  type TryItCommand,
  turnLook,
} from './input';
import { TryItScene } from './render/TryItScene';
import { type LoweringSession, SessionFiles, TryItArea } from './session-source';
import { StateReadout, type TryItReadout } from './state-readout';
import { useTryItStore } from './tryit-store';

/** The strip's words (ADR 0085 D7); it cannot be closed. */
export const STRIP_TEXT = 'Preview, not the real game.';
/** The Play button's label in the strip, and the label when Play is not available. */
export const PLAY_LABEL = 'Play in Minecraft';
export const TEST_LABEL = 'Test in Minecraft…';
/** The guide page's limits list (made by the guide brief). */
export const TRYIT_GUIDE_URL = 'https://meztking.github.io/MCSuperMods/try-it#limits';
/** The first-run card's three lines (ADR 0085 D7). */
export const CARD_LINES = [
  'Real here: how your blocks and mobs look, their states, and which rule runs.',
  'Rough here: walking and flying, and mobs, which only wander.',
  'Not here: commands, redstone, survival (health, hunger, drops). Play in Minecraft for those.',
] as const;
/** The clock speeds offered. */
export const CLOCK_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;
/** How many vanilla props the picker lists at once. */
const PROP_LIST_LIMIT = 60;

/** Props of {@link TryItView}. */
export interface TryItViewProps {
  /** The open project's session. */
  session: LoweringSession;
  /** The project root; a new root makes a new area. */
  root: string | null;
  /** The extracted vanilla cache, or `null` (vanilla props are then left out, D12). */
  vanilla: VanillaAssetReader | null;
  /** Reads a project asset (a texture) the lowered files do not hold. */
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  /** A small picture of a project texture (`assets/...png`), for the hotbar. */
  picture?(assetPath: string): Promise<Uint8Array>;
  /** Grows when a project picture changes, so the area reads its pictures again. */
  assetRevision?: number;
  /** The vanilla block ids of the target (the registry), for the picker's props. */
  vanillaBlockIds?(): Promise<readonly string[]>;
  /** Whether Play (ADR 0084) is connected; else the strip offers "Test in Minecraft…". */
  playAvailable: boolean;
  onPlay(): void;
  onTestInMinecraft(): void;
  /** Opens Settings to set up the Minecraft folder (vanilla looks). */
  onSetUpVanilla?(): void;
  /** Test hook: overrides WebGL detection. */
  webgl?: boolean;
}

/** Whether the WebGL renderer is software (SwiftShader): Smaller picture is then on by default. */
export function softwareRenderer(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (gl === null) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(
      gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL) ?? '',
    );
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader/i.test(name);
  } catch {
    return false;
  }
}

const pictureCache = new Map<string, Promise<string | null>>();

/** A PNG as a `data:` URL (the Content Security Policy allows `data:` pictures, not `blob:`). */
export function pngDataUrl(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(text)}`;
}

/** A slot's picture as a `data:` URL, or `null` (the slot shows its icon). */
function usePicture(
  thing: TryItThing | null,
  folders: ResourceFolders | null,
  vanilla: VanillaAssetReader | null,
  picture: ((assetPath: string) => Promise<Uint8Array>) | undefined,
  revision: number,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const texture = thing?.texture;
  useEffect(() => {
    setUrl(null);
    if (texture === undefined || folders === null) return;
    const path = texturePath(folders, texture);
    const vanillaPicture = path.startsWith('assets/minecraft/');
    const key = `${path}@${vanillaPicture ? 0 : revision}`;
    let promise = pictureCache.get(key);
    if (promise === undefined) {
      const read = vanillaPicture
        ? (vanilla?.readAsset(path) ?? Promise.resolve(null))
        : (picture?.(path) ?? Promise.resolve(null));
      promise = read.then(
        (bytes) => (bytes === null || bytes.length === 0 ? null : pngDataUrl(bytes)),
        () => null,
      );
      pictureCache.set(key, promise);
    }
    let live = true;
    void promise.then((found) => {
      if (live) setUrl(found);
    });
    return () => {
      live = false;
    };
  }, [texture, folders, vanilla, picture, revision]);
  return url;
}

function ThingIcon(props: {
  thing: TryItThing | null;
  folders: ResourceFolders | null;
  vanilla: VanillaAssetReader | null;
  picture: ((assetPath: string) => Promise<Uint8Array>) | undefined;
  revision: number;
}) {
  const url = usePicture(props.thing, props.folders, props.vanilla, props.picture, props.revision);
  if (props.thing === null) return <span className="size-6" aria-hidden />;
  if (url !== null) {
    return (
      <img
        src={url}
        alt=""
        className="size-6"
        style={{ imageRendering: 'pixelated' }}
        data-testid="tryit-thing-picture"
      />
    );
  }
  return props.thing.kind === 'egg' ? (
    <Egg size={20} aria-hidden data-testid="tryit-egg-icon" />
  ) : (
    <Box size={20} aria-hidden className={props.thing.kind === 'prop' ? 'text-muted' : ''} />
  );
}

/** One log line as the panel shows it. */
export function logLineText(line: SimLogLine): string {
  return line.onlyInMinecraft ? `Only in Minecraft: ${line.text}` : line.text;
}

/** The pointed thing for the readout and the outline. */
function readoutPointed(
  pointed: PointedAt,
  state: (pos: { x: number; y: number; z: number }) => BlockState | null,
): TryItReadout['pointed'] {
  if (pointed === null) return undefined;
  if (pointed.kind === 'entity') return undefined;
  if (pointed.block.pos.y < 0) return { kind: 'floor' };
  const found = state(pointed.block.pos);
  return found === null ? undefined : { kind: 'block', state: found };
}

/** Try it's view; see the module comment. */
export default function TryItView(props: TryItViewProps) {
  const { session, root, vanilla } = props;
  const area = useTryItStore((state) => (state.areaRoot === root ? state.area : null));
  const slotsChosen = useTryItStore((state) => state.slots);
  const selected = useTryItStore((state) => state.selected);
  const cardSeen = useTryItStore((state) => state.cardSeen);
  const smallerChoice = useTryItStore((state) => state.smaller);
  const [error, setError] = useState<string | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [propList, setPropList] = useState<readonly string[]>([]);
  const [vanillaStates, setVanillaStates] = useState<ReadonlyMap<string, string>>(new Map());
  const [autoSmaller] = useState(() => (props.webgl === false ? false : softwareRenderer()));
  const smaller = smallerChoice ?? autoSmaller;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const held = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  const lastSpace = useRef<number | null>(null);
  const flyPending = useRef(false);
  const vanillaStatesRef = useRef(vanillaStates);
  vanillaStatesRef.current = vanillaStates;

  // Lower the project while the view is shown; the first files make the area.
  const filesRef = useRef<SessionFiles | null>(null);
  useEffect(() => {
    const files = new SessionFiles(session, {
      onFiles: ({ files: next, target }) => {
        const store = useTryItStore.getState();
        if (store.area !== null && store.areaRoot === root) {
          store.area.setFiles(next, target, vanillaStatesRef.current);
        } else {
          store.setArea(
            new TryItArea({ files: next, target, vanillaBlockstates: vanillaStatesRef.current }),
            root,
          );
        }
        setError(null);
      },
      onError: (failure) => setError(failure instanceof Error ? failure.message : String(failure)),
    });
    filesRef.current = files;
    void files.lowerNow();
    return () => {
      files.dispose();
      filesRef.current = null;
    };
  }, [session, root]);

  // A changed project picture: the area reads its pictures again.
  const revision = props.assetRevision ?? 0;
  const firstRevision = useRef(revision);
  useEffect(() => {
    if (revision !== firstRevision.current) filesRef.current?.bump();
  }, [revision]);

  // The view starts with the keys working.
  useEffect(() => {
    wrapperRef.current?.focus({ preventScroll: true });
  }, []);

  // Re-render on the area's changes (throttled by the area itself).
  const subscribe = useCallback(
    (listener: () => void) => (area === null ? () => {} : area.subscribe(listener)),
    [area],
  );
  useSyncExternalStore(subscribe, () => area?.version ?? -1);

  // Vanilla props for the picker (D12: only with the client jar).
  const { vanillaBlockIds } = props;
  useEffect(() => {
    if (vanilla === null || vanillaBlockIds === undefined) {
      setPropList([]);
      return;
    }
    let live = true;
    vanillaBlockIds().then(
      (ids) => {
        if (live) setPropList(propIds(ids));
      },
      () => {
        if (live) setPropList([]);
      },
    );
    return () => {
      live = false;
    };
  }, [vanilla, vanillaBlockIds]);

  const folders = area?.target.folders.resource ?? null;
  const things = useMemo(
    () =>
      area === null || folders === null
        ? []
        : projectThings(area.source.catalogue, area.source.mobs, area.files, folders),
    // The catalogues change with the files.
    [area, folders, area?.files],
  );
  const chosenProps = useMemo(
    () =>
      Object.values(slotsChosen)
        .filter((id) => id.startsWith('minecraft:'))
        .map((id) => propThing(id)),
    [slotsChosen],
  );
  const slots = useMemo(
    () => hotbarSlots(things, slotsChosen, chosenProps),
    [things, slotsChosen, chosenProps],
  );
  const held1 = slots[selected] ?? null;
  const blockIds = useMemo(
    () => slots.filter((thing) => thing !== null && thing.kind !== 'egg').map((t) => t?.id ?? ''),
    [slots],
  );

  const log = (text: string): void => area?.source.log.info(text);

  const pointed = (): PointedAt =>
    area === null
      ? null
      : area.source.pointedAt({
          alpha: area.clock.alpha,
          yaw: look.current.yaw,
          pitch: look.current.pitch,
        });

  const run = (command: TryItCommand): void => {
    if (area === null) return;
    switch (command.type) {
      case 'slot':
        useTryItStore.getState().select(command.index);
        return;
      case 'picker':
        setPickerOpen((open) => !open);
        return;
      case 'toggleFly':
        flyPending.current = true;
        return;
      case 'turn':
        look.current = turnLook(look.current, command.yaw, command.pitch);
        sendMove();
        rerender();
        return;
      case 'pause':
        if (area.clock.paused) area.clock.resume();
        else area.clock.pause();
        rerender();
        return;
      case 'step':
        sendMove();
        area.clock.step();
        return;
      case 'break': {
        const at = pointed();
        if (at?.kind === 'entity') area.act({ type: 'hit', entity: at.entity.id });
        else if (at?.kind === 'block' && at.block.pos.y >= 0) {
          area.act({ type: 'break', pos: at.block.pos });
        }
        return;
      }
      case 'use': {
        const at = pointed();
        if (at === null) {
          log('Nothing is in reach: point at a block or the floor.');
          return;
        }
        if (at.kind === 'entity') {
          const type = area.source.entities.entity(at.entity.id)?.kind;
          area.source.log.onlyInMinecraft(
            `what happens when you use ${type?.displayName ?? 'a mob'} by hand`,
            type?.origin,
          );
          return;
        }
        area.act({
          type: 'use',
          pos: at.block.pos,
          face: at.block.face,
          hit: at.block.hit,
          ...(held1 === null ? {} : { item: held1.id }),
        });
        return;
      }
      case 'tool':
        useTool(command.tool);
        return;
    }
  };

  const useTool = (tool: string): void => {
    if (area === null) return;
    const at = pointed();
    if (at?.kind !== 'block' || at.block.pos.y < 0) {
      log('Point at a block to use the tool on it.');
      return;
    }
    area.act({ type: 'tool', tool, pos: at.block.pos });
  };

  const sendMove = (): void => {
    if (area === null) return;
    area.act({
      type: 'move',
      ...inputFromHeld(held.current, look.current, flyPending.current),
    });
    flyPending.current = false;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target !== event.currentTarget) return;
    if (MOVEMENT_CODES.has(event.code)) {
      event.preventDefault();
      if (event.code === 'Space' && !event.repeat) {
        const now = performance.now();
        if (isDoubleTap(lastSpace.current, now)) {
          flyPending.current = true;
          lastSpace.current = null;
        } else {
          lastSpace.current = now;
        }
      }
      held.current.add(event.code);
      return;
    }
    const command = commandForKey(event.code);
    if (command === null) return;
    event.preventDefault();
    if (event.repeat && command.type !== 'turn') return;
    run(command);
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>): void => {
    held.current.delete(event.code);
  };

  const onMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    const wrapper = wrapperRef.current;
    if (wrapper === null) return;
    wrapper.focus({ preventScroll: true });
    if (document.pointerLockElement !== wrapper) {
      // The first click takes the mouse; Esc gives it back.
      try {
        const request = wrapper.requestPointerLock?.() as Promise<void> | undefined;
        void request?.catch?.(() => {});
      } catch {
        // No pointer lock here: the keys still work.
      }
      return;
    }
    const command = commandForButton(event.button);
    if (command !== null) {
      event.preventDefault();
      run(command);
    }
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    if (document.pointerLockElement !== wrapperRef.current) return;
    look.current = turnLook(
      look.current,
      event.movementX * MOUSE_DEGREES_PER_PIXEL,
      event.movementY * MOUSE_DEGREES_PER_PIXEL,
    );
  };

  const choose = async (thing: TryItThing): Promise<void> => {
    if (thing.kind === 'prop' && vanilla !== null && area !== null) {
      const path = thing.id.slice('minecraft:'.length);
      if (!vanillaStates.has(thing.id)) {
        const bytes = await vanilla
          .readAsset(
            `assets/minecraft/${area.target.folders.resource.block_definition}/${path}.json`,
          )
          .catch(() => null);
        if (bytes !== null) {
          const next = new Map(vanillaStates);
          next.set(thing.id, new TextDecoder().decode(bytes));
          setVanillaStates(next);
          area.setFiles(area.files, area.target, next);
        }
      }
    }
    useTryItStore.getState().setSlot(selected, thing.id);
    setPickerOpen(false);
    wrapperRef.current?.focus({ preventScroll: true });
  };

  // The readout, read at render time (the area re-renders the view every few ticks).
  const readout: TryItReadout | null =
    area === null
      ? null
      : (() => {
          const at = pointed();
          const pointedState = readoutPointed(at, (pos) => area.source.world.get(pos));
          const entityType =
            at?.kind === 'entity' ? area.source.entities.entity(at.entity.id)?.kind.id : undefined;
          const last = area.lines.at(-1);
          return {
            position: area.source.player.position,
            flying: area.source.player.flying,
            blocks: area.source.world.count,
            entities: area.source.entities.count,
            particles: area.particles.size,
            tick: area.clock.tick,
            paused: area.clock.paused,
            speed: area.clock.speed,
            ...(held1 === null ? {} : { selected: { id: held1.id, name: held1.name } }),
            ...(entityType !== undefined
              ? { pointed: { kind: 'entity' as const, type: entityType } }
              : pointedState === undefined
                ? {}
                : { pointed: pointedState }),
            ...(last === undefined ? {} : { lastLine: last }),
          };
        })();

  const playButton = (testId: string): ReactNode => (
    <Button
      type="button"
      data-testid={testId}
      onClick={props.playAvailable ? props.onPlay : props.onTestInMinecraft}
    >
      <Play size={14} aria-hidden />
      {props.playAvailable ? PLAY_LABEL : TEST_LABEL}
    </Button>
  );

  const pictureProps = {
    folders,
    vanilla,
    picture: props.picture,
    revision,
  };

  const lines = area?.lines ?? [];
  const filterText = filter.trim().toLowerCase();
  const matches = (thing: TryItThing) =>
    filterText === '' ||
    thing.name.toLowerCase().includes(filterText) ||
    thing.id.toLowerCase().includes(filterText);
  const propMatches = propList
    .map((id) => propThing(id))
    .filter(matches)
    .slice(0, PROP_LIST_LIMIT);

  return (
    <section aria-label="Try it" data-testid="tryit-view" className="flex min-h-0 min-w-0 flex-col">
      <div
        role="note"
        data-testid="tryit-strip"
        className="flex flex-wrap items-center gap-2 border-b border-warning bg-panel px-3 py-1.5 text-sm"
      >
        <strong>{STRIP_TEXT}</strong>
        <span className="text-muted">
          Looks and states are real; movement and mobs are rough. Check it in the game.
        </span>
        <span className="ml-auto" />
        {playButton('tryit-play')}
      </div>
      {error !== null && (
        <p role="alert" data-testid="tryit-error" className="px-3 py-1 text-sm text-error">
          Try it could not read the project: {error}
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <div
            ref={wrapperRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the picture must take the keys.
            tabIndex={0}
            role="application"
            aria-label="The test area. Use the keys listed beside it."
            data-testid="tryit-canvas"
            className="relative min-h-64 flex-1 outline-none focus-visible:outline-2 focus-visible:outline-accent"
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onBlur={() => held.current.clear()}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onContextMenu={(event) => event.preventDefault()}
          >
            {area === null || folders === null ? (
              <p className="grid size-full place-items-center text-sm text-muted">
                Loading the test area…
              </p>
            ) : (
              <TryItScene
                grid={area.source.world}
                camera={() => ({
                  eye: area.source.player.eyePosition(area.clock.alpha),
                  yaw: look.current.yaw,
                  pitch: look.current.pitch,
                })}
                picked={() => {
                  const at = pointed();
                  if (at?.kind !== 'block') return null;
                  if (at.block.pos.y < 0) {
                    return { pos: at.block.pos, boxes: [[0, 1, 0, 1, 1, 1]] };
                  }
                  const state = area.source.world.get(at.block.pos);
                  return state === null
                    ? null
                    : { pos: at.block.pos, boxes: area.source.catalogue.outline(state) };
                }}
                blockIds={blockIds}
                files={area.files}
                folders={folders}
                vanilla={vanilla}
                readProjectAsset={props.readProjectAsset}
                particles={area.particles}
                mobs={area.mobField}
                partialTick={() => area.clock.alpha}
                smaller={smaller}
                onFrame={(elapsed) => {
                  sendMove();
                  area.clock.advance(elapsed);
                }}
                label="The test area"
                {...(props.webgl === undefined ? {} : { webgl: props.webgl })}
              >
                {playButton('tryit-play-no-webgl')}
              </TryItScene>
            )}
            {!cardSeen && (
              <div
                role="dialog"
                aria-label="About Try it"
                data-testid="tryit-card"
                className="absolute top-2 left-2 z-20 flex max-w-md flex-col gap-1 rounded border border-border bg-panel p-2 text-sm shadow-lg"
                onMouseDown={(event) => event.stopPropagation()}
              >
                {CARD_LINES.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p className="text-muted">
                  The full list is in the guide:{' '}
                  <a
                    href={TRYIT_GUIDE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline"
                    data-testid="tryit-card-guide"
                  >
                    What Try it cannot show
                  </a>
                  .
                </p>
                <div>
                  <Button
                    type="button"
                    data-testid="tryit-card-close"
                    onClick={() => {
                      useTryItStore.getState().seeCard();
                      wrapperRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    Got it
                  </Button>
                </div>
              </div>
            )}
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg text-white mix-blend-difference"
            >
              +
            </span>
            {pickerOpen && (
              <div
                role="dialog"
                aria-label="Choose what to hold"
                data-testid="tryit-picker"
                className="absolute inset-x-4 top-4 bottom-20 z-30 flex flex-col gap-2 overflow-hidden rounded border border-border bg-panel p-2 text-sm shadow-lg"
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') {
                    setPickerOpen(false);
                    wrapperRef.current?.focus({ preventScroll: true });
                  }
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  <input
                    // biome-ignore lint/a11y/noAutofocus: the picker opens to be typed into.
                    autoFocus
                    aria-label="Find"
                    data-testid="tryit-picker-filter"
                    placeholder="Find a block or a spawn egg"
                    className="flex-1 rounded border border-border bg-bg px-2 py-1"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Close"
                    data-testid="tryit-picker-close"
                    className="cursor-pointer text-muted hover:text-text"
                    onClick={() => {
                      setPickerOpen(false);
                      wrapperRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <h3 className="font-medium">Your blocks and spawn eggs</h3>
                  {things.filter(matches).length === 0 && (
                    <p className="text-muted">Nothing found. Make a block or a mob first.</p>
                  )}
                  <ul className="grid grid-cols-2 gap-1">
                    {things.filter(matches).map((thing) => (
                      <li key={thing.id}>
                        <button
                          type="button"
                          data-testid={`tryit-picker-item-${thing.id}`}
                          className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-bg"
                          onClick={() => void choose(thing)}
                        >
                          <ThingIcon thing={thing} {...pictureProps} />
                          <span className="truncate">{thing.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h3 className="mt-2 font-medium">Minecraft blocks, for looks only</h3>
                  {vanilla === null ? (
                    <p className="text-muted" data-testid="tryit-picker-no-vanilla">
                      Set up your Minecraft folder to place Minecraft's own blocks as props.{' '}
                      {props.onSetUpVanilla !== undefined && (
                        <button
                          type="button"
                          className="cursor-pointer text-accent underline"
                          onClick={props.onSetUpVanilla}
                        >
                          Set it up
                        </button>
                      )}
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-1">
                      {propMatches.map((thing) => (
                        <li key={thing.id}>
                          <button
                            type="button"
                            data-testid={`tryit-picker-item-${thing.id}`}
                            className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-bg"
                            onClick={() => void choose(thing)}
                          >
                            <ThingIcon thing={thing} {...pictureProps} />
                            <span className="truncate">{thing.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            <ol
              aria-label="Hotbar"
              data-testid="tryit-hotbar"
              className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded bg-panel/90 p-1"
            >
              {slots.map((thing, index) => (
                <li key={`${index}-${thing?.id ?? ''}`}>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-pressed={index === selected}
                    aria-label={`Slot ${index + 1}: ${thing?.name ?? 'empty'}`}
                    title={thing === null ? `Slot ${index + 1}: empty` : thing.name}
                    data-testid={`tryit-slot-${index + 1}`}
                    data-thing={thing?.id ?? ''}
                    className={`grid size-10 cursor-pointer place-items-center rounded border ${index === selected ? 'border-accent' : 'border-border'} bg-bg`}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      useTryItStore.getState().select(index);
                      wrapperRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    <ThingIcon thing={thing} {...pictureProps} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <p className="truncate border-t border-border px-2 py-1 text-xs text-muted" aria-hidden>
            Holding {held1?.name ?? 'nothing'}
            {held1?.kind === 'prop' ? ' (for looks only)' : ''}. Click the picture to look with the
            mouse; Esc frees it.
          </p>
        </div>
        <aside
          aria-label="Try it tools"
          className="flex min-h-0 flex-col gap-2 overflow-auto border-l border-border p-2 text-sm"
        >
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              data-testid="tryit-picker-open"
              onClick={() => setPickerOpen(true)}
            >
              <Hand size={14} aria-hidden />
              Choose…
            </Button>
            {SIM_TOOLS.map((tool) => (
              <Button
                key={tool.id}
                type="button"
                data-testid={`tryit-tool-${tool.id}`}
                title={
                  tool.id === 'grow'
                    ? 'Grow the crop or sapling you point at by one stage'
                    : 'Turn the powered or lit picture of the block you point at on or off'
                }
                onClick={() => useTool(tool.id)}
              >
                {tool.label}
              </Button>
            ))}
            <Button
              type="button"
              data-testid="tryit-clear"
              onClick={() => area?.act({ type: 'clear' })}
            >
              Clear the area
            </Button>
          </div>
          <fieldset className="flex flex-wrap items-center gap-1 rounded border border-border p-1">
            <legend className="px-1 text-xs text-muted">Clock</legend>
            <Button
              type="button"
              data-testid="tryit-clock-pause"
              aria-pressed={area?.clock.paused ?? false}
              onClick={() => run({ type: 'pause' })}
            >
              {area?.clock.paused === true ? (
                <Play size={14} aria-hidden />
              ) : (
                <Pause size={14} aria-hidden />
              )}
              {area?.clock.paused === true ? 'Go on' : 'Pause'}
            </Button>
            <Button
              type="button"
              data-testid="tryit-clock-step"
              disabled={area?.clock.paused !== true}
              title="Move the paused clock on by one twentieth of a second"
              onClick={() => run({ type: 'step' })}
            >
              <StepForward size={14} aria-hidden />
              Step
            </Button>
            <label className="flex items-center gap-1">
              Speed
              <select
                data-testid="tryit-clock-speed"
                className="rounded border border-border bg-bg px-1"
                value={area?.clock.speed ?? 1}
                onChange={(event) => {
                  area?.clock.setSpeed(Number(event.target.value));
                  rerender();
                }}
              >
                {CLOCK_SPEEDS.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed === 1 ? 'Normal' : `${speed}×`}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="tryit-smaller"
              checked={smaller}
              onChange={(event) => useTryItStore.getState().setSmaller(event.target.checked)}
            />
            Smaller picture (faster)
          </label>
          <section aria-label="What happened" className="flex min-h-0 flex-col gap-1">
            <h3 className="font-medium">What happened</h3>
            <ol
              data-testid="tryit-log"
              className="max-h-64 min-h-16 overflow-auto rounded border border-border bg-bg p-1 text-xs"
            >
              {lines.length === 0 && <li className="text-muted">Nothing yet.</li>}
              {[...lines]
                .reverse()
                .slice(0, 100)
                .map((line, index) => (
                  <li
                    // Lines never change once written; newest first.
                    key={`${lines.length - index}`}
                    data-testid={line.onlyInMinecraft ? 'tryit-log-only' : 'tryit-log-line'}
                    className={line.onlyInMinecraft ? 'text-warning' : ''}
                  >
                    {logLineText(line)}
                  </li>
                ))}
            </ol>
          </section>
          <details data-testid="tryit-keys" open>
            <summary className="cursor-pointer font-medium">Keys</summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
              {TRYIT_KEYS.map((entry) => (
                <div key={entry.keys} className="contents">
                  <dt className="font-mono">{entry.keys}</dt>
                  <dd>{entry.does}</dd>
                </div>
              ))}
            </dl>
          </details>
        </aside>
      </div>
      {readout !== null && <StateReadout readout={readout} />}
    </section>
  );
}
