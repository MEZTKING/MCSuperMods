// Vite query imports used by the sandbox spike. `vite/client` declares `*?raw` for the web
// project; the node project (which also includes `src/renderer/src/plugins`) needs these.
declare module '*.js?raw' {
  const source: string;
  export default source;
}
declare module '*.ts?raw' {
  const source: string;
  export default source;
}
declare module '*.ts?worker&url' {
  const url: string;
  export default url;
}
