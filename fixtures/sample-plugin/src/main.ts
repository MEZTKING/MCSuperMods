/**
 * Placeholder entry of the sample external plugin, so the scaffold builds and type-checks.
 * B157 replaces it with the `sample.greetings` plugin.
 */

import { definePlugin } from '@msm/plugin-api';

export default definePlugin({ id: 'sample.greetings', apiVersion: '^1.0.0', contributes: {} });
