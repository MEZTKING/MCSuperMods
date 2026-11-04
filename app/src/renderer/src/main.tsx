import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { phase0SamplePlugin } from './plugins/phase0-sample';
import { bridge, createBridgeFileSystem } from './session/bridge-fs';
import { ProjectSession } from './session/project-session';
import './styles.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

const msm = bridge();
const session = new ProjectSession(
  { ...msm, fs: createBridgeFileSystem(msm) },
  { plugins: [phase0SamplePlugin] },
);

createRoot(container).render(
  <StrictMode>
    <App session={session} bridge={msm} />
  </StrictMode>,
);
