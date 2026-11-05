/**
 * Vite's `?raw` imports (the TypeScript lib files the scripting engine bundles): the file's
 * text as a string.
 */
declare module '*?raw' {
  const text: string;
  export default text;
}
