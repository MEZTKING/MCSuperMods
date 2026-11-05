/**
 * Spike only (B150): the bootstrap as a Vite worker entry, to test whether `?worker&url` gives
 * the host a script whose text it can read under electron-vite. Not used by the host.
 *
 * @packageDocumentation
 */

import { STRIPPED_GLOBALS, workerBootstrap } from './worker-bootstrap';

workerBootstrap(true, STRIPPED_GLOBALS);
