import type { EncodeErrorKind } from '@shared/types'

export class EncodeError extends Error {
  constructor(public kind: EncodeErrorKind, message: string, public log = '') { super(message) }
}

export const DISK_FULL = /No space left on device|There is not enough space on the disk/i
