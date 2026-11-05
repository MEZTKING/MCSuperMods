/**
 * Raw WebGL renderer for baked geo models (ADR 0029 D5: no three.js). One program draws the
 * textured bones (one draw call per bone with its world matrix) and the ground grid in a flat
 * colour. Textures use nearest filtering and clamp-to-edge, so any size works in WebGL 1;
 * texels with alpha below 0.1 are discarded, as Minecraft's cutout entity layer does.
 */

import { mat4 } from 'gl-matrix';
import type { BakedModel } from './geometry';

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUv;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec4 world = uModel * vec4(aPosition, 1.0);
  gl_Position = uProjection * uView * world;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTexture;
uniform int uMode;
uniform vec4 uColour;
varying vec2 vUv;
void main() {
  if (uMode == 1) {
    gl_FragColor = uColour;
    return;
  }
  vec4 texel = texture2D(uTexture, vUv);
  if (texel.a < 0.1) discard;
  gl_FragColor = texel;
}
`;

/** A live renderer bound to one WebGL context. */
export interface GeoRenderer {
  /** Draws the grid (world units) and the bones with their world matrices (see `boneMatrices`). */
  draw(projection: mat4, view: mat4, bones: readonly mat4[]): void;
  dispose(): void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('Could not create a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader did not compile: ${gl.getShaderInfoLog(shader) ?? ''}`);
  }
  return shader;
}

/** The magenta and black missing-texture checker, 2x2 pixels. */
export function missingTexturePixels(): Uint8Array {
  return new Uint8Array([248, 0, 248, 255, 0, 0, 0, 255, 0, 0, 0, 255, 248, 0, 248, 255]);
}

/** Line vertices of a square grid on y = 0, `extent` cells each way, `cell` units apart. */
export function gridLines(extent: number, cell: number): Float32Array {
  const out: number[] = [];
  const max = extent * cell;
  for (let i = -extent; i <= extent; i++) {
    const p = i * cell;
    out.push(p, 0, -max, p, 0, max, -max, 0, p, max, 0, p);
  }
  return new Float32Array(out);
}

/**
 * Creates the renderer. `image` is the decoded texture, or `null` for the missing-texture
 * checker. `grid` sizes the ground grid in world units (blocks).
 */
export function createGeoRenderer(
  gl: WebGLRenderingContext,
  model: BakedModel,
  image: TexImageSource | null,
  grid: { extent: number; cell: number },
): GeoRenderer {
  const program = gl.createProgram();
  if (program === null) throw new Error('Could not create a WebGL program.');
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program did not link: ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  const aPosition = gl.getAttribLocation(program, 'aPosition');
  const aUv = gl.getAttribLocation(program, 'aUv');
  const uProjection = gl.getUniformLocation(program, 'uProjection');
  const uView = gl.getUniformLocation(program, 'uView');
  const uModel = gl.getUniformLocation(program, 'uModel');
  const uMode = gl.getUniformLocation(program, 'uMode');
  const uColour = gl.getUniformLocation(program, 'uColour');
  const uTexture = gl.getUniformLocation(program, 'uTexture');

  const buffer = (data: Float32Array): WebGLBuffer => {
    const b = gl.createBuffer();
    if (b === null) throw new Error('Could not create a buffer.');
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  };
  const positions = buffer(model.positions.length > 0 ? model.positions : new Float32Array(3));
  const uvs = buffer(model.uvs.length > 0 ? model.uvs : new Float32Array(2));
  const lines = gridLines(grid.extent, grid.cell);
  const gridBuffer = buffer(lines);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (image === null) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      2,
      2,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      missingTexturePixels(),
    );
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const identity = mat4.create();
  return {
    draw(projection, view, bones) {
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(program);
      gl.uniformMatrix4fv(uProjection, false, projection);
      gl.uniformMatrix4fv(uView, false, view);

      // Grid.
      gl.uniform1i(uMode, 1);
      gl.uniform4f(uColour, 0.5, 0.5, 0.5, 0.6);
      gl.uniformMatrix4fv(uModel, false, identity);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
      if (aUv >= 0) gl.disableVertexAttribArray(aUv);
      gl.drawArrays(gl.LINES, 0, lines.length / 3);

      // Bones.
      gl.uniform1i(uMode, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uTexture, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, positions);
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvs);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
      model.bones.forEach((bone, i) => {
        const matrix = bones[i];
        if (bone.count === 0 || matrix === undefined) return;
        gl.uniformMatrix4fv(uModel, false, matrix);
        gl.drawArrays(gl.TRIANGLES, bone.first, bone.count);
      });
    },
    dispose() {
      gl.deleteBuffer(positions);
      gl.deleteBuffer(uvs);
      gl.deleteBuffer(gridBuffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}
