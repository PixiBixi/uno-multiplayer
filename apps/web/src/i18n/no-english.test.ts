import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * The guard that makes "the interface is translated" a property of the repository
 * rather than a claim somebody made once.
 *
 * Two earlier sweeps declared the client fully translated. Both were wrong, and both
 * were wrong the same way: they grepped for the handful of strings they had just
 * fixed, found none, and reported completeness - which proves only that a fix was
 * applied. This test does the opposite. It enumerates every literal the rendering
 * layer contains and makes each one justify itself.
 *
 * Read from disk with the TypeScript parser rather than by regex over the text,
 * because "is this literal user-facing" is a question about where the literal sits in
 * the syntax, not about the characters in it. `aria-label` reaches a person and
 * `className` does not, and `'btn btn-primary'` is indistinguishable from a phrase
 * until you know which attribute it belongs to. `tokens.test.ts` set the precedent
 * for a test that reads source.
 *
 * What it cannot catch is worth stating, because a guard of unknown reach is worse
 * than none: a string arriving from the server, or a phrase assembled from
 * lower-case single words, would pass. `e2e/i18n.spec.ts` plays a game in a French
 * browser and asserts on the rendered page, which is what covers those.
 */

const SRC = resolve(process.cwd(), 'apps/web/src')

/** Where text becomes pixels. `lib/` and `hooks/` take a catalogue as an argument
 *  instead, which their own tests assert. */
const RENDERING_ROOTS = ['components', 'screens']
const RENDERING_FILES = ['App.tsx']

const collectFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return collectFiles(path)
    if (!/\.tsx?$/.test(entry)) return []
    if (/\.test\.tsx?$/.test(entry)) return []
    return [path]
  })

const MODULES = [
  ...RENDERING_ROOTS.flatMap((root) => collectFiles(join(SRC, root))),
  ...RENDERING_FILES.map((file) => join(SRC, file)),
].sort()

/**
 * The brand, and the one word allowed to be identical in every language.
 *
 * It is the name printed on the box and on the back of every card - `CardBack` draws
 * it as artwork and `Home` sets it as the page's own title. Translating it would be
 * translating a logo.
 */
const ALLOWED = new Set(['UNO'])

/** JSX attributes whose value a person reads or a screen reader speaks. */
const SPEAKING_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'alt',
  'label',
  'placeholder',
  'title',
])

/**
 * Attributes and properties carrying machine vocabulary. Listed rather than
 * inferred: a `className` of `'btn btn-primary'` reads as two English words to any
 * heuristic, and the only thing separating it from prose is the name above it.
 */
const MACHINE_NAMES = new Set([
  'className',
  'class',
  'key',
  'id',
  'htmlFor',
  'type',
  'role',
  'style',
  'd',
  'viewBox',
  'transform',
  'fill',
  'stroke',
  'filter',
  'filterUnits',
  'textAnchor',
  'dominantBaseline',
  'strokeLinecap',
  'strokeLinejoin',
  'autoComplete',
  'inputMode',
  'orientation',
  'background',
  'animationDuration',
  'color',
  'width',
  'height',
  'display',
])

/**
 * Machine vocabulary spelled like an English word. `Escape` is a `KeyboardEvent.key`
 * value fixed by the DOM specification; translating it would break the keyboard
 * rather than the language.
 */
const MACHINE_WORDS = new Set(['Escape'])

type Found = { file: string; line: number; text: string; where: string }

/** A run of two or more Latin letters is the smallest thing that can be a word. */
const hasWords = (value: string): boolean => /[A-Za-z]{2,}/.test(value)

const TWO_WORDS = new RegExp('[A-Za-z]{2,}[  ][A-Za-z]{2,}')
const TRAILING_ELLIPSIS = new RegExp('[A-Za-z]…')

/**
 * Reads as English rather than as a token, by any of three routes.
 *
 * A phrase - two words with a space between them. A trailing ellipsis, which in this
 * codebase only ever ends something said to a player. Or a single word that is
 * SHOUTED or Capitalised, because that is how a lone word gets written when it is
 * meant to be read: `PlayEffects` kept `WILD`, `SKIP` and `REVERSE` exactly that way,
 * and a two-word rule would have walked past all three.
 *
 * Lower-case single words are deliberately not flagged. `'circle'`, `'stroke'`,
 * `'wild4'` and `'dealt'` are the union tags and CSS keywords these modules are built
 * from, and flagging them would make the guard unusable - which is how a guard ends
 * up deleted rather than obeyed.
 */
const readsAsEnglish = (value: string): boolean => {
  const word = value.trim()
  if (MACHINE_WORDS.has(word)) return false
  /* Punctuation stripped before the single-word test, because `'UNO!'` is a word with
     an exclamation on it and French writes that exclamation with a space in front. */
  const bare = word.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z]+$/, '')
  if (/^[A-Za-z]{3,}$/.test(bare) && (bare === bare.toUpperCase() || /^[A-Z][a-z]+$/.test(bare))) {
    return true
  }
  return TWO_WORDS.test(value) || TRAILING_ELLIPSIS.test(value)
}

/** The literal parts of a template, without the expressions spliced into it. */
const templateParts = (node: ts.TemplateExpression): string[] => [
  node.head.text,
  ...node.templateSpans.map((span) => span.literal.text),
]

/** The nearest ancestor that says what a literal is for. */
const frameOf = (node: ts.Node): { kind: string; name: string } => {
  let current: ts.Node | undefined = node.parent
  while (current !== undefined) {
    if (ts.isJsxAttribute(current)) return { kind: 'attribute', name: current.name.getText() }
    if (ts.isPropertyAssignment(current)) return { kind: 'property', name: current.name.getText() }
    if (ts.isCallExpression(current)) return { kind: 'call', name: current.expression.getText() }
    if (ts.isNewExpression(current)) return { kind: 'new', name: current.expression.getText() }
    if (ts.isJsxElement(current) || ts.isJsxFragment(current)) return { kind: 'jsx', name: 'child' }
    current = current.parent
  }
  return { kind: 'module', name: '' }
}

/** Written for whoever opens the console or reads a stack trace, never for a player. */
const isForDevelopers = (frame: { kind: string; name: string }): boolean =>
  (frame.kind === 'call' && frame.name.startsWith('console.')) ||
  (frame.kind === 'new' && /Error$/.test(frame.name))

const speaking: Found[] = []
const phrases: Found[] = []

for (const file of MODULES) {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const where = relative(SRC, file)
  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

  const record = (node: ts.Node, parts: string[]): void => {
    const frame = frameOf(node)
    if (isForDevelopers(frame)) return
    if (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) return

    for (const part of parts) {
      if (!hasWords(part) || ALLOWED.has(part.trim())) continue
      if (frame.kind === 'attribute' && SPEAKING_ATTRIBUTES.has(frame.name)) {
        speaking.push({ file: where, line: lineOf(node), text: part, where: `@${frame.name}` })
        continue
      }
      if (MACHINE_NAMES.has(frame.name)) continue
      if (readsAsEnglish(part)) {
        phrases.push({
          file: where,
          line: lineOf(node),
          text: part,
          where: `${frame.kind} ${frame.name}`.trim(),
        })
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim()
      if (trimmed.length > 0 && hasWords(trimmed) && !ALLOWED.has(trimmed)) {
        speaking.push({ file: where, line: lineOf(node), text: trimmed, where: 'JSX text' })
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      record(node, [node.text])
    } else if (ts.isTemplateExpression(node)) {
      record(node, templateParts(node))
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
}

const report = (found: Found[]): string[] =>
  found.map((entry) => `${entry.file}:${String(entry.line)} (${entry.where}) ${entry.text}`)

describe('the sweep itself', () => {
  it('actually read the rendering layer, so the assertions below mean something', () => {
    // A guard that silently scanned nothing would pass every assertion in this file,
    // which is the failure mode the tokens test learned the hard way.
    expect(MODULES.length).toBeGreaterThan(15)
    expect(MODULES.some((file) => file.endsWith('Card.tsx'))).toBe(true)
    expect(MODULES.some((file) => file.endsWith('Table.tsx'))).toBe(true)
    expect(MODULES.some((file) => file.endsWith('App.tsx'))).toBe(true)
  })

  it('would catch every miss that got through the last two sweeps', () => {
    /* The detector, tested against the real defects rather than trusted. Every one of
       these shipped in a build reported as fully translated. */
    expect(hasWords('Red 7')).toBe(true)
    expect(readsAsEnglish('Face-down card')).toBe(true)
    expect(readsAsEnglish('left the game')).toBe(true)
    expect(readsAsEnglish('reconnecting…')).toBe(true)
    expect(readsAsEnglish('Choose the new colour')).toBe(true)
    expect(readsAsEnglish('the host')).toBe(true)
    expect(readsAsEnglish('Cancel')).toBe(true)
    expect(readsAsEnglish('REVERSE')).toBe(true)
    expect(readsAsEnglish('UNO!')).toBe(true)

    // And does not fire on the machine vocabulary it sits next to.
    expect(readsAsEnglish('M18 6 6 18M6 6l12 12')).toBe(false)
    expect(readsAsEnglish('rotate(-27 60 84)')).toBe(false)
    expect(readsAsEnglish('var(--red)')).toBe(false)
    expect(readsAsEnglish('circle')).toBe(false)
    expect(readsAsEnglish('wild4')).toBe(false)
    expect(readsAsEnglish('Escape')).toBe(false)
    expect(hasWords('+2')).toBe(false)
  })
})

describe('no component or screen holds a user-facing English literal', () => {
  it('names nothing a person reads or a screen reader speaks', () => {
    /* The largest class, and the one the last sweep missed most visibly: every card
       on the table carried an English `aria-label`, so a French player heard "Red 7"
       on every one of them. Anything meant to be read comes from a catalogue. */
    expect(report(speaking)).toEqual([])
  })

  it('holds no phrase at all, even one that never reaches an attribute', () => {
    /* `Seat.tsx` kept its two status notes in a `Record<SeatStatus, string>` and
       rendered them through a variable, which no check on JSX or on attributes could
       have seen. A phrase in one of these modules is a phrase in the wrong file
       whatever route it takes to the screen. */
    expect(report(phrases)).toEqual([])
  })
})
