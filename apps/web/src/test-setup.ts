import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Testing Library's automatic cleanup only registers itself when Vitest globals
 * are enabled. They are not — tests import describe/it/expect explicitly — so
 * unmounting is wired here. Without it, renders pile up in the same document and
 * queries start finding several matches.
 */
afterEach(() => {
  cleanup()
})
