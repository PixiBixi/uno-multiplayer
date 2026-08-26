import { describe, expect, it } from 'vitest'
import { createVoiceRooms } from './voice-room.js'

describe('voice rooms', () => {
  it('starts empty and reports members after a join', () => {
    const rooms = createVoiceRooms()
    const room = rooms.in('ABCDEF')
    expect(room.peers()).toEqual([])
    room.join(0)
    room.join(2)
    expect(room.peers()).toEqual([
      { seat: 0, muted: false },
      { seat: 2, muted: false },
    ])
  })

  it('orders peers by seat regardless of join order', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(3)
    room.join(1)
    expect(room.peers().map((peer) => peer.seat)).toEqual([1, 3])
  })

  it('joining twice does not duplicate a seat or reset its mute', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(1)
    room.setMuted(1, true)
    room.join(1)
    expect(room.peers()).toEqual([{ seat: 1, muted: true }])
  })

  it('excludes the asking seat from its own peer list', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(0)
    room.join(1)
    expect(room.peersExcept(0)).toEqual([{ seat: 1, muted: false }])
  })

  it('forgets a seat on leave', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(0)
    room.leave(0)
    expect(room.has(0)).toBe(false)
    expect(room.peers()).toEqual([])
  })

  it('ignores mute and leave for a seat that never joined', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.setMuted(2, true)
    room.leave(2)
    expect(room.peers()).toEqual([])
  })

  it('keeps rooms independent and drops them on request', () => {
    const rooms = createVoiceRooms()
    rooms.in('AAAAAA').join(0)
    rooms.in('BBBBBB').join(1)
    expect(rooms.in('AAAAAA').peers()).toEqual([{ seat: 0, muted: false }])
    expect(rooms.size()).toBe(2)
    rooms.drop('AAAAAA')
    expect(rooms.size()).toBe(1)
  })
})
