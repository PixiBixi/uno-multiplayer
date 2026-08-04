/**
 * Side-effect CSS imports carry no value; they exist so the bundler picks the
 * file up. Declared narrowly on purpose: pulling in all of `vite/client` would
 * add browser globals to the server's program too.
 */
declare module '*.css' {}

/** Vite's `?raw` suffix yields the file's text, which the token tests assert on. */
declare module '*.css?raw' {
  const content: string
  export default content
}
