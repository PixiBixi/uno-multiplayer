import { randomInt } from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@uno/protocol'

/**
 * Cryptographically random, over an alphabet with no visually ambiguous
 * characters. `Math.random` would make live room codes guessable.
 */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length))
  }
  return code
}
