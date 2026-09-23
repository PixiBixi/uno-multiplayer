import { describe, expect, it } from 'vitest'
import { isAllowedOrigin } from './origin.js'

describe('isAllowedOrigin', () => {
  it('accepts a client that sends no Origin, which no browser does', () => {
    expect(isAllowedOrigin(undefined, 'uno.example.com', [])).toBe(true)
  })

  it('accepts a page served by this same host', () => {
    expect(isAllowedOrigin('https://uno.example.com', 'uno.example.com', [])).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:5050', '127.0.0.1:5050', [])).toBe(true)
  })

  it('compares the port too, since another port is another origin', () => {
    expect(isAllowedOrigin('http://127.0.0.1:3000', '127.0.0.1:5050', [])).toBe(false)
  })

  it('refuses a page on another site', () => {
    expect(isAllowedOrigin('https://evil.example', 'uno.example.com', [])).toBe(false)
  })

  it('accepts an origin on the allowlist', () => {
    const allowlist = ['https://play.example.com']
    expect(isAllowedOrigin('https://play.example.com', 'api.example.com', allowlist)).toBe(true)
  })

  it('refuses an opaque or malformed Origin', () => {
    expect(isAllowedOrigin('null', 'uno.example.com', [])).toBe(false)
    expect(isAllowedOrigin('not a url', 'uno.example.com', [])).toBe(false)
  })

  it('refuses a browser Origin when the request carries no Host to compare with', () => {
    expect(isAllowedOrigin('https://uno.example.com', undefined, [])).toBe(false)
  })
})
