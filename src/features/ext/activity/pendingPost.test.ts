import { afterEach, describe, expect, it } from 'vitest'
import { forgetPost, rememberPost, waitingPost } from './pendingPost'

describe('pendingPost', () => {
  afterEach(() => forgetPost())

  it('keeps the post for its own room only', () => {
    rememberPost('m1', 'r1', 1000)
    expect(waitingPost(null, 1000)).toBeNull()
    expect(waitingPost('r1', 1500)).toBe('m1')
    forgetPost()
    expect(waitingPost('r1', 1500)).toBeNull()
  })

  it('drops a request older than 30 seconds', () => {
    rememberPost('m1', null, 0)
    expect(waitingPost(null, 31_000)).toBeNull()
    expect(waitingPost(null, 1)).toBeNull()
  })
})
