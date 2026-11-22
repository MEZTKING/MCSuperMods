/**
 * Post effect and shader program templates (ADR 0106 D2). The GLSL sources they name are the
 * project's own assets under `shaders/` (`<projectNamespace>:post/<name>` is
 * `assets/<projectNamespace>/shaders/post/<name>.vsh` and `.fsh`), exported unchecked.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { postEffectKind } from '../kinds/post-effect';
import { shaderKind } from '../kinds/shader';

const CATEGORY = 'Shaders';

/** The last path segment of the new element, used to name its own shader files. */
const leaf = (path: string): string => path.split('/').pop() ?? path;

/** The post effect and shader program templates, in picker order. */
export const shaderTemplates: readonly ElementTemplate[] = [
  {
    id: 'post_effect_creeper',
    kind: postEffectKind.id,
    category: CATEGORY,
    title: 'Spectator view effect',
    description:
      'Replaces what you see while spectating a creeper with your own shader, then copies the result back to the screen: add shaders/post/<name>.vsh, <name>.fsh and copy.fsh (a plain copy) to the project. Works in a plain resource pack; check the look in game.',
    defaultNamespace: 'minecraft',
    defaultName: 'creeper',
    data: (context) => {
      const own = `${context.projectNamespace}:post/${leaf(context.path)}`;
      return {
        targets: { [`${context.projectNamespace}:swap`]: {} },
        passes: [
          {
            vertex_shader: own,
            fragment_shader: own,
            inputs: [{ sampler_name: 'In', target: 'minecraft:main' }],
            output: `${context.projectNamespace}:swap`,
          },
          {
            vertex_shader: own,
            fragment_shader: `${context.projectNamespace}:post/copy`,
            inputs: [{ sampler_name: 'In', target: `${context.projectNamespace}:swap` }],
            output: 'minecraft:main',
          },
        ],
      };
    },
  },
  {
    id: 'shader_program',
    kind: shaderKind.id,
    category: CATEGORY,
    title: 'Shader program',
    description:
      'A shader program naming your own vertex and fragment files (shaders/<name>.vsh and .fsh in the project), one sampler and no uniforms. The game does not check the GLSL until it loads.',
    prefix: 'program/',
    data: (context) => {
      const own = `${context.projectNamespace}:${context.path}`;
      return { vertex: own, fragment: own, samplers: [{ name: 'Sampler0' }], uniforms: [] };
    },
  },
];
