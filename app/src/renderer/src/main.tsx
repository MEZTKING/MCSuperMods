import { builtInTargets } from '@msm/targets';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { builtInPlugins } from './plugins/built-in';
import { loadExternalPlugins } from './plugins/external-plugins';
import { bridge, createBridgeFileSystem } from './session/bridge-fs';
import { mcfunctionCheckerFromPlatform } from './session/mcfunction-problems';
import { ProjectSession } from './session/project-session';
import './styles.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

const msm = bridge();
// Headless smoke runs skip Monaco (see `MsmBridge.isSmoke`).
if (msm.isSmoke === true) window.msmNoMonaco = true;

async function start(root: HTMLElement): Promise<void> {
  // Third-party plugins (ADR 0035) start in sandboxed workers before the session exists, so
  // their kinds register after the built-ins; a plugin that does not start within 10 s is
  // `plugin.timeout`. Without a plugins folder this is one IPC round trip.
  const external = await loadExternalPlugins(msm, { builtIns: builtInPlugins });
  // Function sources are checked by the Spyglass service in main (ADR 0014), for the target
  // of the open project at call time.
  const session: ProjectSession = new ProjectSession(
    { ...msm, fs: createBridgeFileSystem(msm) },
    {
      plugins: builtInPlugins,
      externalPlugins: external.plugins,
      externalPluginStatus: external,
      externalSymbols: external.symbols,
      targets: builtInTargets,
      mcfunction: mcfunctionCheckerFromPlatform(msm.mcfunction, () => session.target.id),
      // Scripts are transpiled and checked by TypeScript in main (ADRs 0031 and 0032).
      scripting: msm.scripting,
    },
  );

  createRoot(root).render(
    <StrictMode>
      <App session={session} bridge={msm} />
    </StrictMode>,
  );
}

void start(container);
