/**
 * Try it's view (ADR 0085 D4, D7, D12, D13; B390): the strip "Preview, not the real game." with
 * the Play button, the first-run card, the test area's picture with a crosshair and the hotbar,
 * the picker, the tools (Grow, Power, Clear the area), the clock, the log with its "Only in
 * Minecraft:" lines, the keys list and the hidden state readout.
 *
 * B398 adds the "What happened" panel with its links and "Run every time" (`WhatHappened.tsx`),
 * the items `give_item` gave ("Your items"), chips and sound captions over the picture
 * (`Chips.tsx`, `effects.ts`), using a mob (its `on_interact`) and the mock-up screens of
 * containers and machines (`MockScreen.tsx`).
 *
 * B405 adds the grounds (ADR 0087): "Start on" in the first-run card and the side panel's
 * "Ground" with "Change ground…" open the picker (`GroundPicker.tsx`); the view makes or reads
 * the ground, reads Minecraft's block states for it when the client jar is set up, and loads it
 * into the area. Without the jar, a hint says Minecraft's terrain and wood are MSM's own drawn pictures and other
 * blocks plain coloured cubes.
 *
 * The view lowers the open project through {@link SessionFiles} while it is shown and keeps one
 * {@link TryItArea} in the Try it store, so the area survives a trip to a Studio and back. Every
 * mouse action has a key (`input.ts`). The labels are the same words in every mode (ADR 0083 D7:
 * "picture", "mob", seconds).
 *
 * B483 adds batch 2 of vanilla parity (ADR 0101 D5): a trader mob's merchant mock-up
 * (`traders/MerchantScreen.tsx`), fluid buckets in the hotbar and the fluids drawn
 * (`fluids/`), and the side panel's "Sky" (a project dimension type's sky colour, `render/sky.ts`).
 *
 * This module is a lazy chunk: the shell imports it with `lazy()`.
 */

import type { Project, ResourceLocation } from '@msm/core';
import { SCRIPT_API } from '@msm/plugin-scripting';
import {
  type BlockState,
  blockIdOf,
  type GroundBlocks,
  type GroundKind,
  type PointedAt,
  pick as pickBlock,
  type QuickWorldOptions,
  SIM_TOOLS,
  type SimLogLine,
} from '@msm/sim';
import { Box, Car, Egg, Hand, Pause, Play, StepForward, X } from 'lucide-react';
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
import type { TryItWorldArea, TryItWorldsPlatform } from '../../../shared/platform';
import { Button } from '../components/ui/Button';
import type { ResourceFolders, VanillaAssetReader } from '../preview/model-chain';
import { useUiStore } from '../store/ui-store';
import { Blocks2Overlay, Blocks2Panel, type ChatState } from './blocks2/Blocks2Overlay';
import { bagThings } from './blocks2/things';
import { Chips } from './Chips';
import { webAudioOut } from './effects';
import { fluidLooks } from './fluids/fluid-pass';
import { bucketThings } from './fluids/things';
import { GroundPicker } from './GroundPicker';
import {
  describeGround,
  GROUND_CHOICES,
  type GroundChoice,
  groundBlocksFor,
  worldAreaLine,
  worldErrorText,
  worldGround,
} from './grounds';
import {
  blockTexture,
  hotbarSlots,
  projectThings,
  propIds,
  propThing,
  type TryItThing,
  texturePath,
} from './hotbar';
import { gameKeyName, gameMouseName, projectKey, projectKeyLines, takenKeyLine } from './hud/keys';
import { TryItHud } from './hud/TryItHud';
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
import { MockScreen } from './MockScreen';
import { projectSkies } from './render/sky';
import { TryItScene } from './render/TryItScene';
import {
  type LoweringSession,
  ruleBooksOf,
  SessionFiles,
  type TranspileOutcome,
  TryItArea,
  type TryItScripts,
} from './session-source';
import { StateReadout, type TryItReadout } from './state-readout';
import { MerchantScreen } from './traders/MerchantScreen';
import { useTryItStore } from './tryit-store';
import { driverCamera } from './vehicles/camera';
import { VEHICLE_KEYS, vehicleKey } from './vehicles/keys';
import { vehicleThings } from './vehicles/things';
import { VehiclePanel } from './vehicles/VehiclePanel';
import { WhatHappened } from './WhatHappened';

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
/** The tools' hints (the Water and Explode tools, B463). */
const TOOL_TITLES: Readonly<Record<string, string>> = {
  grow: 'Grow the plant you point at as one bone meal would (a crop, sapling or stem one stage)',
  power: 'Turn the powered or lit picture of the block you point at on or off',
  water: 'Put water into the block you point at, or take it out, when it can hold water',
  explode: 'Set off an explosion at the block you point at (your explosion rules hear it)',
  lightning:
    'Strike the block you point at with lightning: blocks that age go back a stage, as copper does',
};
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
  /**
   * Opens an element at a field (a "What happened" link). Default: leaves Try it and selects
   * the element on the Form tab with the field focused.
   */
  onOpenElement?(elementId: string, pointer: string | null): void;
  /**
   * Reads the user's worlds for "From my world" (ADR 0087 D7). Default: the preload's
   * `window.msm.tryItWorlds`; `null` turns the choice off.
   */
  worlds?: TryItWorldsPlatform | null;
  /**
   * The scripting service that transpiles scripts for the area (B400). Default: the preload's
   * `window.msm.scripting`; `null` leaves scripts to the game (they are said out loud).
   */
  scripting?: ScriptTranspiler | null;
  /** Test hook: overrides WebGL detection. */
  webgl?: boolean;
}

/** The part of the scripting service Try it uses (ADR 0031 D2). */
export interface ScriptTranspiler {
  transpile(source: string, name: string): Promise<TranspileOutcome>;
}

/** The preload's scripting service, when there is one. */
function defaultScripting(): ScriptTranspiler | null {
  const bridge = (globalThis as { msm?: { scripting?: ScriptTranspiler } }).msm;
  return bridge?.scripting ?? null;
}

/** How an area runs scripts with `scripting`, or `undefined` without it. */
function areaScripts(scripting: ScriptTranspiler | null): TryItScripts | undefined {
  if (scripting === null) return undefined;
  return { transpile: (source, name) => scripting.transpile(source, name), api: SCRIPT_API };
}

/** The preload's world reader, when there is one. */
function defaultWorlds(): TryItWorldsPlatform | null {
  const bridge = (globalThis as { msm?: { tryItWorlds?: TryItWorldsPlatform } }).msm;
  return bridge?.tryItWorlds ?? null;
}

/** The hint beside the ground without the client jar. */
export const NO_VANILLA_GROUND_TEXT =
  'Without your Minecraft folder, its terrain and wood show as MSM’s own drawn pictures and other blocks as plain coloured cubes. Set up your Minecraft folder to see Minecraft’s pictures.';

/** The default of {@link TryItViewProps.onOpenElement}. */
function openElement(elementId: string, pointer: string | null): void {
  useTryItStore.getState().close();
  useUiStore.getState().navigateTo(elementId as ResourceLocation, pointer);
}

/** The heading of the items `give_item` gave. */
export const YOUR_ITEMS_TITLE = 'Your items';

/** The sound player of every area (one `AudioContext` for the app). */
let sharedAudio: ReturnType<typeof webAudioOut> | undefined;
const audioOut = () => {
  sharedAudio ??= webAudioOut();
  return sharedAudio;
};

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
  if (props.thing.kind === 'vehicle') return <Car size={20} aria-hidden />;
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
  if (pointed.kind === 'entity' || pointed.kind === 'vehicle') return undefined;
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
  const keysSaid = useRef(new Set<string>());
  const flyPending = useRef(false);
  const vanillaStatesRef = useRef(vanillaStates);
  vanillaStatesRef.current = vanillaStates;
  const [groundsOpen, setGroundsOpen] = useState<GroundKind | null>(null);
  // The chat box (B463): closed, or open with its first line.
  const [chat, setChat] = useState<ChatState>(null);
  const [lastQuick, setLastQuick] = useState<QuickWorldOptions | undefined>(undefined);
  // The sky (B483): MSM's own (''), or a project dimension's id whose own type gives the colour.
  const [skyChoice, setSkyChoice] = useState('');
  const worlds = props.worlds === undefined ? defaultWorlds() : props.worlds;
  const scripting = props.scripting === undefined ? defaultScripting() : props.scripting;

  // Lower the project while the view is shown; the first files make the area.
  const filesRef = useRef<SessionFiles | null>(null);
  useEffect(() => {
    const scriptsFor = areaScripts(scripting);
    const files = new SessionFiles(session, {
      onFiles: ({ files: next, target }) => {
        const store = useTryItStore.getState();
        const ruleBooks = ruleBooksOf(session.snapshot.project);
        if (store.area !== null && store.areaRoot === root) {
          store.area.setFiles(next, target, vanillaStatesRef.current);
          store.area.setRuleBooks(ruleBooks);
        } else {
          store.setArea(
            new TryItArea({
              files: next,
              target,
              vanillaBlockstates: vanillaStatesRef.current,
              readProjectAsset: props.readProjectAsset,
              audio: audioOut(),
              ruleBooks,
              ...(scriptsFor === undefined ? {} : { scripts: scriptsFor }),
            }),
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
    // `readProjectAsset` is read once per area; the session's own reader does not change.
  }, [session, root]);

  // The project as the links read it, followed while the view is shown.
  const [project, setProject] = useState<Project | null>(session.snapshot.project);
  useEffect(() => {
    setProject(session.snapshot.project);
    return session.subscribe((snapshot) => setProject(snapshot.project));
  }, [session]);

  // The rule books name plain rules by key (B396); a renamed rule may not change the files.
  useEffect(() => {
    area?.setRuleBooks(ruleBooksOf(project));
  }, [area, project]);

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
        : [
            // A fluid's own block is placed only from its bucket (B483).
            ...projectThings(area.source.catalogue, area.source.mobs, area.files, folders).filter(
              (thing) => !area.source.fluids.isFluid(thing.id),
            ),
            ...bucketThings(area.source.fluids.catalogue.all(), area.files, folders),
            ...vehicleThings(area.source.vehicles.types, area.files, folders),
            ...bagThings(
              area.source.parity2.bagItems,
              (id) => area.source.itemName(id),
              area.files,
              folders,
            ),
          ],
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
  // The fluids the picture draws, and the skies the project's dimension types give (B483).
  const fluids = useMemo(
    () => (area === null ? new Map() : fluidLooks(area.source.fluids.catalogue.all())),
    // The catalogue changes with the files.
    [area, area?.files],
  );
  const skies = useMemo(() => projectSkies(project), [project]);
  const sky = skies.find((one) => one.dimension === skyChoice) ?? null;
  const blockIds = useMemo(
    () =>
      slots
        .filter((thing) => thing !== null && (thing.kind === 'block' || thing.kind === 'prop'))
        .map((t) => t?.id ?? ''),
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
        else if (at?.kind === 'vehicle') area.act({ type: 'hitVehicle', vehicle: at.vehicle.id });
        else if (at?.kind === 'block' && at.block.pos.y >= 0) {
          area.act({ type: 'break', pos: at.block.pos });
        }
        return;
      }
      case 'use': {
        const at = pointed();
        if (at === null && held1?.kind === 'bag') {
          // A bag opens from the hand, pointed at nothing too (B463).
          area.source.useItem(held1.id);
          rerender();
          return;
        }
        if (at === null) {
          log('Nothing is in reach: point at a block or the floor.');
          return;
        }
        if (at.kind === 'vehicle') {
          area.act({
            type: 'useVehicle',
            vehicle: at.vehicle.id,
            ...(held1 === null ? {} : { item: held1.id }),
          });
          return;
        }
        if (at.kind === 'entity') {
          area.act({
            type: 'interact',
            entity: at.entity.id,
            ...(held1 === null ? {} : { item: held1.id }),
          });
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
    // The project's key binds hear every key of the picture first (B429).
    const own =
      area === null || event.target !== event.currentTarget || event.ctrlKey || event.metaKey
        ? null
        : projectKey(
            area.source.controls.keys,
            gameKeyName(area.target, event.code),
            true,
            event.repeat,
          );
    if (area !== null && vehicleKey(event, true, area.source.vehicles)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target !== event.currentTarget) return;
    if ((event.code === 'KeyT' || event.code === 'Slash') && !event.repeat) {
      // The chat box, as the game's T and / (B463).
      event.preventDefault();
      held.current.clear();
      area?.source.controls.keys.releaseAll();
      setChat({ start: event.code === 'Slash' ? '/' : '' });
      return;
    }
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
    if (own !== null && area !== null) {
      // A project key takes one of Try it's own keys; said once per key.
      if (!keysSaid.current.has(own)) {
        keysSaid.current.add(own);
        const bind = area.source.controls.keys.binds.onKey(own)[0];
        area.source.log.info(takenKeyLine(own, bind?.displayName ?? own, command));
      }
      return;
    }
    if (event.repeat && command.type !== 'turn') return;
    run(command);
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (area !== null) {
      projectKey(area.source.controls.keys, gameKeyName(area.target, event.code), false);
    }
    if (area !== null && vehicleKey(event, false, area.source.vehicles)) return;
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
    const own =
      area === null
        ? null
        : projectKey(area.source.controls.keys, gameMouseName(area.target, event.button), true);
    const command = commandForButton(event.button);
    if (command !== null) {
      event.preventDefault();
      if (own === null) run(command);
    }
  };

  const onMouseUp = (event: MouseEvent<HTMLDivElement>): void => {
    if (area === null) return;
    projectKey(area.source.controls.keys, gameMouseName(area.target, event.button), false);
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    if (document.pointerLockElement !== wrapperRef.current) return;
    look.current = turnLook(
      look.current,
      event.movementX * MOUSE_DEGREES_PER_PIXEL,
      event.movementY * MOUSE_DEGREES_PER_PIXEL,
    );
  };

  /**
   * Reads Minecraft's block state definitions of `ids` from the client jar (once each), so the
   * catalogue gives their props real properties, and hands them to the area.
   */
  const loadVanillaStates = async (ids: Iterable<string>): Promise<void> => {
    if (vanilla === null || area === null) return;
    const before = vanillaStatesRef.current;
    const wanted = [...new Set(ids)].filter((id) => id.startsWith('minecraft:') && !before.has(id));
    if (wanted.length === 0) return;
    const folder = area.target.folders.resource.block_definition;
    const read = await Promise.all(
      wanted.map((id) =>
        vanilla
          .readAsset(`assets/minecraft/${folder}/${id.slice('minecraft:'.length)}.json`)
          .catch(() => null),
      ),
    );
    const next = new Map(vanillaStatesRef.current);
    wanted.forEach((id, index) => {
      const bytes = read[index];
      if (bytes !== null && bytes !== undefined) next.set(id, new TextDecoder().decode(bytes));
    });
    if (next.size === vanillaStatesRef.current.size) return;
    vanillaStatesRef.current = next;
    setVanillaStates(next);
    area.setFiles(area.files, area.target, next);
  };

  /** Makes or reads a ground and loads it into the area (the picker's "Use this ground"). */
  const applyGround = async (
    choice: GroundChoice,
    progress: (text: string) => void = () => {},
  ): Promise<void> => {
    if (area === null) throw new Error('The test area is not ready yet.');
    let ground: GroundBlocks | undefined;
    const lines: string[] = [];
    if (choice.kind === 'world') {
      if (worlds === null) throw new Error('Your worlds cannot be read in this window.');
      progress(`Reading the area of ${choice.worldName}…`);
      let read: TryItWorldArea;
      try {
        read = await worlds.readArea({ worldId: choice.worldId, centre: choice.centre });
      } catch (failure) {
        throw new Error(worldErrorText(failure));
      }
      ground = worldGround(read);
      lines.push(worldAreaLine(read), ...read.warnings);
    } else {
      progress('Making the ground…');
      ground = groundBlocksFor(choice);
    }
    if (ground !== undefined) {
      progress('Reading Minecraft’s blocks…');
      await loadVanillaStates(ground.palette.map(blockIdOf));
    }
    progress('Filling the area…');
    // Let the words show before the fill takes the thread.
    await new Promise((done) => setTimeout(done, 0));
    area.loadGround(choice.kind, ground, describeGround(choice), lines);
    if (choice.kind === 'quick') setLastQuick(choice.options);
    look.current = { yaw: look.current.yaw, pitch: 0 };
    wrapperRef.current?.focus({ preventScroll: true });
  };

  const choose = async (thing: TryItThing): Promise<void> => {
    if (thing.kind === 'prop') await loadVanillaStates([thing.id]);
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
            ground: area.ground,
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

  const screenOpen = area?.source.screen ?? null;
  const closeScreen = (): void => {
    area?.closeScreen();
    wrapperRef.current?.focus({ preventScroll: true });
  };
  const inventory =
    area === null
      ? []
      : area.source.inventory.slots.flatMap((stack, index) =>
          stack === null
            ? []
            : [
                {
                  index,
                  count: stack.count,
                  thing: {
                    id: stack.id,
                    name: area.source.itemName(stack.id),
                    kind: 'block' as const,
                    ...(() => {
                      const texture =
                        folders === null ? undefined : blockTexture(area.files, folders, stack.id);
                      return texture === undefined ? {} : { texture };
                    })(),
                  },
                },
              ],
        );
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
            onBlur={() => {
              held.current.clear();
              // The game's client lets go of held keys when the window loses focus.
              area?.source.controls.keys.releaseAll();
            }}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
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
                camera={() =>
                  driverCamera(
                    area.source.vehicles,
                    area.clock.alpha,
                    look.current,
                    (origin, direction, distance) =>
                      pickBlock(
                        (x, y, z) => area.source.world.get({ x, y, z }),
                        area.source.catalogue,
                        origin,
                        direction,
                        distance,
                      )?.distance ?? distance,
                  ) ?? {
                    eye: area.source.player.eyePosition(area.clock.alpha),
                    yaw: look.current.yaw,
                    pitch: look.current.pitch,
                  }
                }
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
                fluids={fluids}
                sky={sky?.rgb ?? null}
                mobs={area.mobField}
                vehicles={{
                  snapshots: () => area.source.vehicles.snapshots(),
                  kind: (type) => area.source.vehicles.types.get(type),
                  log: area.source.log,
                }}
                partialTick={() => area.clock.alpha}
                smaller={smaller}
                onFrame={(elapsed) => {
                  // The look turns with a surface vehicle's hull, as a passenger's does.
                  const turn = area.source.vehicles.takeLookTurn();
                  if (turn !== 0) look.current = turnLook(look.current, turn, 0);
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
                <div className="flex flex-wrap items-center gap-1" data-testid="tryit-card-grounds">
                  <span>Start on:</span>
                  {GROUND_CHOICES.map((entry) => (
                    <Button
                      key={entry.kind}
                      data-testid={`tryit-card-ground-${entry.kind}`}
                      aria-pressed={area?.ground === entry.kind}
                      disabled={area === null}
                      onClick={() => {
                        if (entry.kind === 'grid' || entry.kind === 'flat') {
                          if (area?.hasChanges === true) setGroundsOpen(entry.kind);
                          else void applyGround({ kind: entry.kind });
                        } else {
                          setGroundsOpen(entry.kind);
                        }
                      }}
                    >
                      {entry.label}
                      {entry.kind === 'quick' || entry.kind === 'world' ? '…' : ''}
                    </Button>
                  ))}
                </div>
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
            {area !== null && (
              <Chips
                chips={area.effects.chips}
                captions={area.effects.captions}
                mobName={(entity) => area.source.entities.entity(entity)?.kind.displayName}
              />
            )}
            {area !== null && (
              <TryItHud
                frame={() => area.source.controls.hud.frame()}
                dashboard={() => area.source.controls.dashboard()}
                files={area.files}
                target={area.target}
              />
            )}
            {screenOpen !== null && <MockScreen screen={screenOpen} onClose={closeScreen} />}
            {area?.source.traders.open != null && (
              <MerchantScreen
                key={area.source.traders.open.mobId}
                open={area.source.traders.open}
                nameOf={(id) => area.source.itemName(id)}
                onTrade={(index, all) => {
                  area.source.traders.trade(index, all, (id) => area.source.itemName(id));
                  rerender();
                }}
                onClose={() => {
                  area.source.traders.close();
                  rerender();
                  wrapperRef.current?.focus({ preventScroll: true });
                }}
              />
            )}
            {area !== null && (
              <Blocks2Overlay
                area={area}
                pointed={(() => {
                  const at = pointed();
                  return at?.kind === 'block' && at.block.pos.y >= 0 ? at.block.pos : null;
                })()}
                heldSlot={selected}
                chat={chat}
                onCloseChat={() => setChat(null)}
                onChanged={rerender}
                onFocusBack={() => wrapperRef.current?.focus({ preventScroll: true })}
              />
            )}
            {groundsOpen !== null && area !== null && (
              <GroundPicker
                initial={groundsOpen}
                {...(lastQuick === undefined ? {} : { quick: lastQuick })}
                hasChanges={area.hasChanges}
                worlds={worlds}
                {...(props.vanillaBlockIds === undefined
                  ? {}
                  : { blockIds: props.vanillaBlockIds })}
                pictures={
                  vanilla === null
                    ? null
                    : { vanilla: (path: string) => vanilla.readAsset(path).catch(() => null) }
                }
                texturesFolder={area.target.folders.resource.textures}
                onApply={applyGround}
                onClose={() => {
                  setGroundsOpen(null);
                  wrapperRef.current?.focus({ preventScroll: true });
                }}
              />
            )}
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
                    placeholder="Find a block, a spawn egg or a vehicle"
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
                  <h3 className="font-medium">Your blocks, spawn eggs and vehicles</h3>
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
                title={TOOL_TITLES[tool.id]}
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
          {area !== null && (
            <Blocks2Panel
              area={area}
              onOpenChat={() => setChat({ start: '/' })}
              onChanged={rerender}
            />
          )}
          <fieldset className="flex flex-col gap-1 rounded border border-border p-1">
            <legend className="px-1 text-xs text-muted">Ground</legend>
            <span data-testid="tryit-ground-current" data-ground={area?.ground ?? 'grid'}>
              {area?.groundDescription ?? 'Grid'}
            </span>
            <div>
              <Button
                data-testid="tryit-ground-change"
                disabled={area === null}
                onClick={() => setGroundsOpen(area?.ground ?? 'grid')}
              >
                Change ground…
              </Button>
            </div>
            {vanilla === null && area !== null && area.ground !== 'grid' && (
              <p className="text-xs text-muted" data-testid="tryit-ground-no-vanilla">
                {NO_VANILLA_GROUND_TEXT}{' '}
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
            )}
          </fieldset>
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
          {skies.length > 0 && (
            <label
              className="flex items-center gap-1"
              title="The sky colour of a dimension type of yours; no sun, moon, clouds or night in the preview"
            >
              Sky
              <select
                data-testid="tryit-sky"
                data-sky={sky?.hex ?? ''}
                className="min-w-0 flex-1 rounded border border-border bg-bg px-1"
                value={sky === null ? '' : sky.dimension}
                onChange={(event) => setSkyChoice(event.target.value)}
              >
                <option value="">The preview's own</option>
                {skies.map((one) => (
                  <option key={one.dimension} value={one.dimension}>
                    {one.name}'s sky
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="tryit-smaller"
              checked={smaller}
              onChange={(event) => useTryItStore.getState().setSmaller(event.target.checked)}
            />
            Smaller picture (faster)
          </label>
          {area !== null && (
            <VehiclePanel
              vehicles={area.source.vehicles}
              pointed={(() => {
                const at = pointed();
                return at?.kind === 'vehicle' ? at.vehicle.id : null;
              })()}
              onGetIn={(id) => {
                area.source.vehicles.getIn(id);
                rerender();
                wrapperRef.current?.focus({ preventScroll: true });
              }}
              onGetOut={() => {
                area.source.vehicles.getOut();
                rerender();
                wrapperRef.current?.focus({ preventScroll: true });
              }}
              onFillTank={(id) => {
                area.source.vehicles.fillTank(id);
                rerender();
              }}
              onRepair={(id) => {
                area.source.vehicles.repairFully(id);
                rerender();
              }}
            />
          )}
          <section aria-label={YOUR_ITEMS_TITLE} className="flex flex-col gap-1">
            <h3 className="font-medium">{YOUR_ITEMS_TITLE}</h3>
            {inventory.length === 0 ? (
              <p data-testid="tryit-inventory-empty" className="text-xs text-muted">
                Nothing yet. Rules that give you items fill this row.
              </p>
            ) : (
              <ol data-testid="tryit-inventory" className="flex flex-wrap gap-1">
                {inventory.map((slot) => (
                  <li
                    key={slot.index}
                    data-testid="tryit-inventory-slot"
                    data-item={slot.thing.id}
                    data-count={slot.count}
                    title={`${slot.count} ${slot.thing.name}`}
                    className="relative grid size-9 place-items-center rounded border border-border bg-bg"
                  >
                    <ThingIcon thing={slot.thing} {...pictureProps} />
                    <span className="sr-only">{`${slot.count} ${slot.thing.name}`}</span>
                    <span
                      aria-hidden
                      className="absolute right-0.5 bottom-0 text-xs font-medium text-text"
                    >
                      {slot.count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <WhatHappened
            entries={area?.whatHappened ?? []}
            project={project}
            onOpen={props.onOpenElement ?? openElement}
            runEveryTime={area?.runEveryTime ?? false}
            onRunEveryTime={(on) => area?.setRunEveryTime(on)}
          />
          <details data-testid="tryit-keys" open>
            <summary className="cursor-pointer font-medium">Keys</summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
              {[
                ...TRYIT_KEYS,
                ...(area !== null && area.source.vehicles.types.ids().length > 0
                  ? VEHICLE_KEYS
                  : []),
                ...(area === null ? [] : projectKeyLines(area.source.controls.keys.binds)),
              ].map((entry) => (
                <div key={`${entry.keys}|${entry.does}`} className="contents">
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
