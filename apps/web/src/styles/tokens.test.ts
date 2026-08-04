import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* Read from disk by path. `import.meta.url` is not a file: URL under jsdom, and
   Vite's `?raw` is intercepted by its CSS plugin — which returned an empty
   string and made the absence assertions below pass for the wrong reason. */
const TOKENS_PATH = resolve(process.cwd(), 'apps/web/src/styles/tokens.css')
const tokens = readFileSync(TOKENS_PATH, 'utf8')

/** Declarations only. The comments explain why `ui-*` generics are banned, and a
 *  guard that reads its own rationale as a violation is useless. */
const declarations = tokens.replace(/\/\*[\s\S]*?\*\//g, '')

describe('the token file itself', () => {
  it('was actually read, so the assertions below mean something', () => {
    expect(tokens.length).toBeGreaterThan(500)
    expect(tokens).toContain(':root')
  })
})

describe('design tokens', () => {
  /**
   * A regression guard, not pedantry. `ui-rounded` is Safari-only, and one
   * unsupported generic invalidates the entire font-family declaration — Chrome
   * silently rendered every heading in its default serif. Nothing failed, no
   * warning appeared; the page just looked wrong.
   */
  it('uses no ui-* generic font families', () => {
    const offenders = [...declarations.matchAll(/\bui-(?:rounded|sans-serif|serif|monospace)\b/g)]
    expect(offenders.map((match) => match[0])).toEqual([])
  })

  it('self-hosts the display face rather than hoping for a system one', () => {
    expect(tokens).toContain('@font-face')
    expect(tokens).toMatch(/font-family:\s*'Fredoka'/)
    expect(tokens).toMatch(/url\('\.\.\/assets\/fonts\/fredoka-600\.woff2'\)/)
  })

  it('ends every font stack on a real generic so text always renders', () => {
    for (const token of ['--display', '--body', '--data']) {
      const match = new RegExp(`${token}:([^;]+);`).exec(tokens)
      expect(match, `${token} is missing`).not.toBeNull()
      expect(match?.[1]?.trim()).toMatch(/(sans-serif|serif|monospace)$/)
    }
  })

  it('defines both themes, and lets the explicit toggle win over the media query', () => {
    expect(tokens).toContain('@media (prefers-color-scheme: dark)')
    expect(tokens).toContain(":root[data-theme='dark']")
    expect(tokens).toContain(":root[data-theme='light']")
    expect(tokens.indexOf(":root[data-theme='dark']")).toBeGreaterThan(
      tokens.indexOf('@media (prefers-color-scheme: dark)'),
    )
  })
})
