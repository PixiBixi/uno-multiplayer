import { randomBytes } from 'node:crypto'
import type { DeckState } from '@uno/engine'

/** 128 bits from the CSPRNG for one deal: too wide to recover from a player's own hand. */
export function randomDealSeed(): DeckState {
  const bytes = randomBytes(16)
  return [
    bytes.readUInt32LE(0),
    bytes.readUInt32LE(4),
    bytes.readUInt32LE(8),
    bytes.readUInt32LE(12),
  ]
}
