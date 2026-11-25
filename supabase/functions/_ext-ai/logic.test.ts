import { describe, expect, it } from 'vitest'
import { AI_MODEL, checkAccess, corsHeaders, costOf, readChannelId } from './logic.ts'

describe('costOf', () => {
  it('prices Sonnet 5.5 at $2 / $10 per million tokens', () => {
    expect(AI_MODEL).toBe('claude-sonnet-5-5')
    expect(costOf('claude-sonnet-5-5', { input_tokens: 30_000, output_tokens: 4_000 })).toBe(0.1)
    expect(costOf('claude-sonnet-5-5', { input_tokens: 25, output_tokens: 8 })).toBe(0.00013)
  })

  it('counts cache writes and reads, and missing fields as zero', () => {
    expect(costOf('claude-haiku-5-5', { cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 })).toBe(0.135)
    expect(costOf('claude-sonnet-5-5', {})).toBe(0)
    expect(costOf('claude-sonnet-5-5', { input_tokens: null, output_tokens: null })).toBe(0)
  })

  it('prices an unknown model at the highest rate so the cap never under-counts', () => {
    expect(costOf('claude-new-model', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(60)
  })
})

describe('checkAccess', () => {
  const ok = { isServerAdmin: true, isChannelGm: true, hasKey: true, monthSpentUsd: 1, monthlyCapUsd: 5 }

  it('lets the server admin GM call when a key is set and under the cap', () => {
    expect(checkAccess(ok)).toBeNull()
  })

  it('refuses anyone else, then a missing key, then a reached cap', () => {
    expect(checkAccess({ ...ok, isServerAdmin: false })?.code).toBe('not_allowed')
    expect(checkAccess({ ...ok, isChannelGm: false, hasKey: false })?.code).toBe('not_allowed')
    expect(checkAccess({ ...ok, hasKey: false })).toMatchObject({ status: 503, code: 'no_key' })
    expect(checkAccess({ ...ok, monthSpentUsd: 5 })).toMatchObject({ status: 402, code: 'cap_reached' })
    expect(checkAccess({ ...ok, monthlyCapUsd: 0, monthSpentUsd: 0 })?.code).toBe('cap_reached')
  })
})

describe('readChannelId', () => {
  it('accepts only a campaign id', () => {
    expect(readChannelId({ channelId: '11111111-1111-1111-1111-11111111111A' })).toBe('11111111-1111-1111-1111-11111111111a')
    expect(readChannelId({ channelId: 'nope' })).toBeNull()
    expect(readChannelId({ channelId: 3 })).toBeNull()
    expect(readChannelId(null)).toBeNull()
    expect(readChannelId('x')).toBeNull()
  })
})

describe('corsHeaders', () => {
  it('echoes only allowed origins, defaulting to the local app', () => {
    expect(corsHeaders('http://localhost:5173', undefined)['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(corsHeaders('https://evil.test', undefined)['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeaders('https://pbp.example.test', ' https://pbp.example.test , https://other.test')['Access-Control-Allow-Origin']).toBe(
      'https://pbp.example.test',
    )
    expect(corsHeaders('http://localhost:5173', 'https://pbp.example.test')['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeaders(null, undefined)['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')
  })
})
