/**
 * Side-effect CSS imports carry no value; they exist so the bundler picks the
 * file up. Declared narrowly on purpose: pulling in all of `vite/client` would
 * add browser globals to the server's program too, since the whole repo
 * typechecks as one project.
 */
declare module '*.css' {}
