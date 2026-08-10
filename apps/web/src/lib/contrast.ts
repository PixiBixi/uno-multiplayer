/**
 * WCAG relative luminance and contrast ratio, over hex colours.
 *
 * It lives here because a card face is not decoration: the numeral has to be read
 * at a glance, on a phone, on felt, by somebody who is losing. "It looks fine" is
 * not a measurement, and every judgement made by eye in this project that mattered
 * turned out to be wrong in one direction or the other.
 *
 * Contrast is computed from the theme's declared colours rather than sampled from
 * the screen, so the numbers can be asserted in a unit test and cannot drift after
 * a colour is edited. They were also verified against rendered pixels in Chromium;
 * see the card themes section of the README.
 */
const channel = (value: number): number =>
  value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)

const parse = (hex: string): [number, number, number] => {
  const body = hex.replace('#', '')
  const full =
    body.length === 3
      ? body
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : body
  const packed = Number.parseInt(full, 16)
  if (full.length !== 6 || Number.isNaN(packed)) throw new Error(`not a hex colour: ${hex}`)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parse(hex).map((value) => channel(value / 255)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 1 for a colour against itself, 21 for black against white. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
