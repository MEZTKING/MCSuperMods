import { builtInTargets } from '@msm/targets';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { builtInPlugins } from './plugins/built-in';
import { bridge, createBridgeFileSystem } from './session/bridge-fs';
import { mcfunctionCheckerFromPlatform } from './session/mcfunction-problems';
import { ProjectSession } from './session/project-session';
import './styles.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

const msm = bridge();
// Headless smoke runs skip Monaco (see `MsmBridge.isSmoke`).
if (msm.isSmoke === true) window.msmNoMonaco = true;
// Function sources are checked by the Spyglass service in main (ADR 0014), for the target
// of the open project at call time.
const session: ProjectSession = new ProjectSession(
  { ...msm, fs: createBridgeFileSystem(msm) },
  {
    plugins: builtInPlugins,
    targets: builtInTargets,
    mcfunction: mcfunctionCheckerFromPlatform(msm.mcfunction, () => session.target.id),
    // Scripts are transpiled and checked by TypeScript in main (ADRs 0031 and 0032).
    scripting: msm.scripting,
  },
);

createRoot(container).render(
  <StrictMode>
    <App session={session} bridge={msm} />
  </StrictMode>,
);
