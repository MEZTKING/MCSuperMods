/**
 * "Export as a map…" (ADR 0116 D2): pick a world of the managed Play instance (Play my game's
 * `msm-game-<ns>` first) or of a launcher instance, name the map, choose "Keep my player
 * data", then main writes one file: a world `.zip` with the project's data pack in
 * `datapacks/` and its resource pack as `resources.zip`, or, when the project needs the mod
 * jar, a `.mrpack` with the jar and the world under `overrides/saves/`. Loaded on demand (a
 * lazy chunk of its own).
 *
 * @packageDocumentation
 */

import { mrpackIndex } from '@msm/exporters';
import { mapFolderName } from '@msm/interop';
import type { TargetFacts } from '@msm/plugin-api';
import { useEffect, useId, useState } from 'react';
import type { MapExportResult, MapsPlatform, MapWorldSource } from '../../../shared/platform';
import type { MapContent } from '../session/project-session';
import { fieldClass, Modal } from './NewElementDialog';
import { WorldPickerDialog } from './WorldPickerDialog';

/** Play my game's world folder (ADR 0116 D1), the natural first pick. */
export function gameWorldOf(namespace: string | null): string | undefined {
  return namespace === null ? undefined : `msm-game-${namespace}`;
}

/** The plain words of a finished export for the status line. */
export function mapExportMessage(result: MapExportResult): string {
  const players = result.leftOut.some((entry) => entry.reason === 'player-data')
    ? ' Player data was left out.'
    : '';
  return result.kind === 'mrpack'
    ? `Saved the map with the mod as ${result.path} (a Modrinth modpack: import it in Prism Launcher or the Modrinth app).${players}`
    : `Saved the map as ${result.path} (unzip it into a saves folder to play it).${players}`;
}

/**
 * The `.mrpack` index of a map: the target's Fabric loader and Fabric API (as a modpack's,
 * ADR 0046 D4) with no other downloads.
 *
 * @throws Error When the target has no Fabric API download on record.
 */
export function mapMrpackIndex(name: string, target: TargetFacts): string {
  const fabric = target.fabric;
  const api = fabric?.apiModrinth;
  if (fabric === undefined || api === undefined) {
    throw new Error(
      `Minecraft ${target.mcVersion} has no Fabric API download on record, so a map with the mod cannot be written.`,
    );
  }
  const index = mrpackIndex({
    name,
    version: '1.0.0',
    summary: 'A map made with MCSuperMods.',
    minecraft: target.mcVersion,
    fabricLoader: fabric.loader,
    downloads: [
      { fileName: api.fileName, url: api.url, sha1: api.sha1, sha512: api.sha512, size: api.size },
    ],
    jars: [],
  });
  return `${JSON.stringify(index, null, 2)}\n`;
}

export interface ExportMapDialogProps {
  maps: MapsPlatform;
  target: TargetFacts;
  /** The project's first namespace, for `msm-game-<ns>`. */
  namespace: string | null;
  projectName: string;
  /** Builds the packs or the jar (`ProjectSession.buildMapContent`). */
  build(): Promise<MapContent>;
  /** Called with the status line once the map is written. */
  onDone(message: string): void;
  onClose(): void;
}

/** The first error of a blocked build, in a sentence. */
function blockedText(content: MapContent): string {
  const errors = content.report.problems.filter((problem) => problem.severity === 'error');
  const first = errors[0]?.message ?? 'The project has problems.';
  return `The map was not saved: the project has ${errors.length} error(s). ${first}`;
}

export default function ExportMapDialog(props: ExportMapDialogProps) {
  const { maps, target } = props;
  const [sources, setSources] = useState<MapWorldSource[] | null>(null);
  const [sourceId, setSourceId] = useState<string>('');
  const [mapName, setMapName] = useState(() => mapFolderName(props.projectName));
  const [keepPlayerData, setKeepPlayerData] = useState(false);
  const [step, setStep] = useState<'options' | 'world'>('options');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceFieldId = useId();
  const nameFieldId = useId();
  const keepFieldId = useId();

  useEffect(() => {
    let live = true;
    maps.listWorlds(target.id).then(
      (listed) => {
        if (!live) return;
        setSources(listed);
        const first = listed.find((source) => source.worlds.length > 0) ?? listed[0];
        setSourceId(first?.id ?? '');
      },
      (reason: unknown) => {
        if (!live) return;
        setSources([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [maps, target.id]);

  const source = sources?.find((entry) => entry.id === sourceId);

  const exportWorld = async (worldDir: string): Promise<void> => {
    if (source === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const content = await props.build();
      if (!content.report.ok) {
        setError(blockedText(content));
        return;
      }
      const name = mapFolderName(mapName);
      const base = {
        targetId: target.id,
        sourceId: source.id,
        worldDir,
        keepPlayerData,
        mapName: name,
      };
      let result: MapExportResult | null;
      if (content.needsJar) {
        if (content.jar === undefined) {
          setError(blockedText(content));
          return;
        }
        result = await maps.exportMap({
          ...base,
          mrpack: {
            index: mapMrpackIndex(name, target),
            jars: [{ fileName: `${content.jar.modId}.jar`, data: content.jar.data }],
          },
        });
      } else {
        result = await maps.exportMap({
          ...base,
          ...(content.dataPack === undefined ? {} : { dataPack: content.dataPack }),
          ...(content.resourcePack === undefined ? {} : { resourcePack: content.resourcePack }),
        });
      }
      if (result === null) return;
      await content.recordExport();
      props.onDone(mapExportMessage(result));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'world' && source !== undefined) {
    return (
      <WorldPickerDialog
        open
        worlds={source.worlds}
        title={`Export as a map — ${source.name}`}
        submitLabel={busy ? 'Saving…' : 'Export'}
        busy={busy}
        error={error}
        locationName={source.name}
        {...(source.managed
          ? (() => {
              const first = gameWorldOf(props.namespace);
              return first === undefined ? {} : { initialDir: first };
            })()
          : {})}
        onPick={(world) => void exportWorld(world.dir)}
        onClose={() => {
          if (busy) return;
          setError(null);
          setStep('options');
        }}
      />
    );
  }

  const noWorlds = sources !== null && !sources.some((entry) => entry.worlds.length > 0);
  return (
    <Modal
      title="Export as a map"
      error={error}
      testId="export-map-dialog"
      submitLabel="Choose world…"
      busy={sources === null || source === undefined || source.worlds.length === 0}
      onCancel={props.onClose}
      onSubmit={() => {
        if (mapName.trim() === '') {
          setError('Give the map a name.');
          return;
        }
        setError(null);
        setStep('world');
      }}
    >
      {sources === null ? (
        <p className="text-muted text-sm">Looking for worlds…</p>
      ) : noWorlds ? (
        <p className="text-muted text-sm" data-testid="export-map-empty">
          No worlds found. Press Play my game (or Play) first, or make a world in Minecraft.
        </p>
      ) : (
        <>
          <label htmlFor={sourceFieldId}>Worlds from</label>
          <select
            id={sourceFieldId}
            data-testid="export-map-source"
            className={fieldClass}
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            {sources.map((entry) => (
              <option key={entry.id} value={entry.id} disabled={entry.worlds.length === 0}>
                {entry.managed ? `${entry.name} (Play and Play my game)` : entry.name} ·{' '}
                {entry.worlds.length} world(s)
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor={nameFieldId}>Map name</label>
      <input
        id={nameFieldId}
        data-testid="export-map-name"
        className={fieldClass}
        value={mapName}
        maxLength={64}
        onChange={(event) => setMapName(event.target.value)}
      />
      <label className="flex items-center gap-2" htmlFor={keepFieldId}>
        <input
          id={keepFieldId}
          type="checkbox"
          data-testid="export-map-keep-player-data"
          checked={keepPlayerData}
          onChange={(event) => setKeepPlayerData(event.target.checked)}
        />
        Keep my player data
      </label>
      <p className="text-xs text-muted" data-testid="export-map-note">
        The map gets this project's data pack and resource pack. A project that needs the mod is
        saved as a Modrinth modpack (.mrpack) with the mod and the world. Without "Keep my player
        data", inventories, advancements and statistics are left out, so every player starts fresh.
        The world's settings (cheats, seed) stay as they are.
      </p>
    </Modal>
  );
}
