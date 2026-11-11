import { describe, expect, it } from 'vitest'
import { clientIp } from './client-ip.js'

const handshake = (address: string, forwardedFor?: string | string[]) => ({
  address,
  headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
})

describe('clientIp', () => {
  it('takes the leftmost X-Forwarded-For entry behind the proxy', () => {
    expect(clientIp(handshake('172.18.0.2', '203.0.113.7, 10.0.0.1'), true)).toBe('203.0.113.7')
  })

  it('reads the first header when it arrives repeated', () => {
    expect(clientIp(handshake('172.18.0.2', ['203.0.113.7', '198.51.100.1']), true)).toBe(
      '203.0.113.7',
    )
  })

  it('ignores X-Forwarded-For without a proxy, where any client could forge it', () => {
    expect(clientIp(handshake('198.51.100.9', '203.0.113.7'), false)).toBe('198.51.100.9')
  })

  it('ignores X-Forwarded-For from a public peer, which reached the port directly', () => {
    expect(clientIp(handshake('198.51.100.9', '203.0.113.7'), true)).toBe('198.51.100.9')
    expect(clientIp(handshake('2001:db8::1', '203.0.113.7'), true)).toBe('2001:db8::1')
  })

  it('trusts loopback and every unique-local range as the proxy', () => {
    for (const proxy of ['127.0.0.1', '10.1.2.3', '172.31.0.2', '192.168.1.1', '::1', 'fd00::2']) {
      expect(clientIp(handshake(proxy, '203.0.113.7'), true)).toBe('203.0.113.7')
    }
    expect(clientIp(handshake('172.32.0.2', '203.0.113.7'), true)).toBe('172.32.0.2')
  })

  it('falls back to the socket address when the proxy sent no header', () => {
    expect(clientIp(handshake('198.51.100.9'), true)).toBe('198.51.100.9')
    expect(clientIp(handshake('198.51.100.9', ' , '), true)).toBe('198.51.100.9')
  })

  it('folds an IPv4-mapped IPv6 address onto its IPv4 form', () => {
    expect(clientIp(handshake('::ffff:198.51.100.9'), false)).toBe('198.51.100.9')
    expect(clientIp(handshake('172.18.0.2', '::ffff:203.0.113.7'), true)).toBe('203.0.113.7')
  })
})
