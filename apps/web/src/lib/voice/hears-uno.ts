import type { Locale } from '../../i18n/messages.js'

/**
 * What recognisers return for a shouted "uno", per locale: a French engine offers
 * "ou no", an English one does not. "you know" is absent on purpose - the closest
 * English homophone is also a common filler, and taking it rebuilds the old bug.
 */
const HEARD: Record<Locale, readonly string[]> = {
  en: ['uno', 'una', 'oono', 'u no'],
  fr: ['uno', 'una', 'ouno', 'ou no', 'u no', 'huno', 'hu no', 'juno'],
}

/** Lowercase, accents dropped, everything that is not a letter becomes a space. */
const normalise = (transcript: string): string =>
  transcript
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()

export function hearsUno(transcript: string, locale: Locale): boolean {
  // Padded both ends so a match is always on whole words: "unoriginal" must miss.
  const heard = ` ${normalise(transcript)} `
  return (HEARD[locale] ?? HEARD.en).some((word) => heard.includes(` ${word} `))
}
