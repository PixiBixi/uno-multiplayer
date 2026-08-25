import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* Read from disk by path. `import.meta.url` is not a file: URL under jsdom, and
   Vite's `?raw` is intercepted by its CSS plugin - which returned an empty
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

/* The stylesheet, not the token file: a redesign that zeroes the radius tokens still
   leaves behind every rule that hard-coded its own, and those are exactly the ones
   nobody looks at again. Two of them shipped as visible defects before this existed. */
describe('the stylesheet against the tokens', () => {
  const SHEET_PATH = resolve(process.cwd(), 'apps/web/src/styles/app.css')
  const sheet = readFileSync(SHEET_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('was actually read', () => {
    expect(sheet.length).toBeGreaterThan(1000)
  })

  /* 999px is the pill idiom the editorial direction dropped. At the sizes the
     interface actually uses it, a pill renders as a circle - which is how the score
     presets ended up as three rings. */
  it('leaves no pill radius behind', () => {
    expect([...sheet.matchAll(/border-radius:\s*999px/g)].length).toBe(0)
  })

  /* 50% is a real circle and stays: the presence dot and the colour orb are round on
     purpose. Everything else either takes a token or is square. */
  it('hard-codes no radius except the deliberate circles', () => {
    const offenders = [...sheet.matchAll(/border-radius:\s*([^;]+);/g)]
      .map((match) => match[1]?.trim() ?? '')
      /* `50%` is a real circle - the presence dot and the colour orb are round on
         purpose - and `inherit` is how an overlay follows whatever it covers. */
      .filter((value) => !value.startsWith('var(--') && value !== '50%' && value !== 'inherit')
    expect(offenders).toEqual([])
  })

  /* A field left native renders as the platform's grey box, which is the one thing on
     the page that belongs to no design at all. */
  it('styles every text field rather than leaving one native', () => {
    expect(sheet).toMatch(/\.field,|\.field\b/)
  })
})

describe('design tokens', () => {
  /**
   * A regression guard, not pedantry. `ui-rounded` is Safari-only, and one
   * unsupported generic invalidates the entire font-family declaration - Chrome
   * silently rendered every heading in its default serif. Nothing failed, no
   * warning appeared; the page just looked wrong.
   */
  it('uses no ui-* generic font families', () => {
    const offenders = [...declarations.matchAll(/\bui-(?:rounded|sans-serif|serif|monospace)\b/g)]
    expect(offenders.map((match) => match[0])).toEqual([])
  })

  it('self-hosts the display face rather than hoping for a system one', () => {
    expect(tokens).toContain('@font-face')
    expect(tokens).toMatch(/font-family:\s*'Archivo Black'/)
    expect(tokens).toMatch(/url\('\.\.\/assets\/fonts\/archivo-black-400\.woff2'\)/)
  })

  /* The editorial direction rests on flat colour separated by rules, not on panels
     floating above a ground. A stray radius reads as the old card-shaped interface. */
  it('keeps the furniture radii at zero, and gives cards the only one', () => {
    for (const token of ['--r-sm', '--r-md', '--r-lg']) {
      expect(new RegExp(`${token}:\\s*0;`).test(tokens), `${token} is not 0`).toBe(true)
    }
    expect(tokens).toMatch(/--r-card:\s*8px;/)
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
