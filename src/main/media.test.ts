import { describe, expect, it } from 'vitest'
import { mediaFileFor, mediaUrl } from './media'

describe('squish-media protocol', () => {
  it('maps a url to a file inside the media folder', () => {
    expect(mediaFileFor('squish-media://local/after-3.mp4', 'C:\\tmp\\m')).toBe('C:\\tmp\\m\\after-3.mp4')
  })
  it('rejects traversal and nested paths', () => {
    expect(mediaFileFor('squish-media://local/..%5C..%5Csecret.txt', 'C:\\tmp\\m')).toBeNull()
    expect(mediaFileFor('squish-media://local/a/b.mp4', 'C:\\tmp\\m')).toBeNull()
  })
  it('builds urls', () => {
    expect(mediaUrl('before-1.mp4')).toBe('squish-media://local/before-1.mp4')
  })
})
