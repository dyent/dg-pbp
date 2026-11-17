import { describe, it, expect } from 'vitest'
import { APP_NAME, UPSTREAM_APP_NAME, resolveAppName } from './branding'

describe('resolveAppName', () => {
  it('uses the configured name', () => {
    expect(resolveAppName('Role by Post by Dylan')).toBe('Role by Post by Dylan')
  })

  it('trims surrounding spaces', () => {
    expect(resolveAppName('  Dylan’s Table  ')).toBe('Dylan’s Table')
  })

  it('falls back to the upstream name when unset or blank', () => {
    expect(resolveAppName(undefined)).toBe('Role by Post')
    expect(resolveAppName('   ')).toBe('Role by Post')
    expect(resolveAppName(42)).toBe('Role by Post')
  })
})

describe('APP_NAME', () => {
  it('is the upstream name in tests, so upstream assertions stay valid', () => {
    expect(APP_NAME).toBe(UPSTREAM_APP_NAME)
  })
})
