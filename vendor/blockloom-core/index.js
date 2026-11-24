/* @blockloom/core — deterministic texture generation without DOM, canvas, or network. */
export {
  ENGINE_VERSION,
  MODIFIERS,
  generate,
  generateSet,
  listMaterials,
  listModifiers,
  modifierLabel,
  parsePrompt,
  renderTextureBuffer,
  textureTitle,
} from './engine.js';
export {
  COLOR_WORDS,
  FINISHES,
  FINISH_CONFIG,
  MATERIALS,
  MATERIAL_GROUPS,
  MODIFIER_WORDS,
  getMaterial,
} from './data.js';
