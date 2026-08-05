import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard.js'

/* jsdom ships neither `navigator.clipboard` nor `document.execCommand`, which
   makes it a faithful stand-in for the insecure-context browser this code exists
   for: with nothing stubbed, both paths fail exactly as they would there. */

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

function stubExecCommand(implementation: () => boolean): void {
  Object.defineProperty(document, 'execCommand', {
    value: implementation,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
  document.body.replaceChildren()
})

describe('copyText', () => {
  it('uses the Clipboard API when it is available', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    stubClipboard(writeText)

    await expect(copyText('8A242X')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('8A242X')
  })

  it('falls back to a selection when the Clipboard API is absent', async () => {
    // The self-hosted case: http://<lan-ip>:5050 exposes no navigator.clipboard.
    const selected: string[] = []
    stubExecCommand(() => {
      /* Reading the value off the focused element proves the carrier really is
         selected at the moment of the copy — the property the command depends
         on — rather than merely proving we called the command. */
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement) selected.push(active.value)
      return true
    })

    await expect(copyText('8A242X')).resolves.toBe(true)
    expect(selected).toEqual(['8A242X'])
  })

  it('falls back when the Clipboard API rejects', async () => {
    // A secure context can still refuse: denied permission, unfocused document.
    stubClipboard(vi.fn().mockRejectedValue(new Error('not allowed')))
    stubExecCommand(() => true)

    await expect(copyText('8A242X')).resolves.toBe(true)
  })

  it('reports failure rather than throwing when no path works', async () => {
    await expect(copyText('8A242X')).resolves.toBe(false)
  })

  it('leaves no carrier behind and hands focus back, even when the copy fails', async () => {
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()

    await copyText('8A242X')

    expect(document.querySelector('textarea')).toBeNull()
    // Otherwise a keyboard user is silently dropped at the top of the document.
    expect(document.activeElement).toBe(button)
  })
})
