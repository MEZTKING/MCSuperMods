import { builtInTargets } from '@msm/targets';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { builtInPlugins } from './plugins/built-in';
import { bridge, createBridgeFileSystem } from './session/bridge-fs';
import { ProjectSession } from './session/project-session';
import './styles.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

const msm = bridge();
// Headless smoke runs skip Monaco (see `MsmBridge.isSmoke`).
if (msm.isSmoke === true) window.msmNoMonaco = true;
const session = new ProjectSession(
  { ...msm, fs: createBridgeFileSystem(msm) },
  { plugins: builtInPlugins, targets: builtInTargets },
);

createRoot(container).render(
  <StrictMode>
    <App session={session} bridge={msm} />
  </StrictMode>,
);
