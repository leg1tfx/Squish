import { describe, expect, it } from 'vitest'
import type { EncodeOutcome } from './api'
import type { EncoderId, Settings, VideoInfo } from './types'
import {
  durationBucket, encodeEvent, encodersProp, extProp, isRendererEvent, modeProp, presetProp, progressBucket, ratioBucket, sizeBucket
} from './telemetry'

const settings: Settings = { res: '1080', fps: 'best', audio: 'high', codec: 'h264', maxMB: 10, bitrateKbps: null, interpolate: 'off', encoder: 'auto' }
const info = { path: 'C:\\Users\\Lou\\Videos\\secret client.mp4', sizeBytes: 120_000_000, durationSec: 42 } as VideoInfo
const encoders: EncoderId[] = ['nvenc', 'cpu']
const base = { info, settings, meta: { presetId: 'discord', edited: false }, encoders, lastFraction: 0.6 }

describe('buckets', () => {
  it('sizeBucket uses MB (1e6 bytes) with inclusive lower bounds', () => {
    expect(sizeBucket(9_999_999)).toBe('<10')
    expect(sizeBucket(10_000_000)).toBe('10-50')
    expect(sizeBucket(499_999_999)).toBe('100-500')
    expect(sizeBucket(2_000_000_000)).toBe('>=2000')
  })
  it('ratioBucket handles normal, bigger-than-source and zero-byte inputs', () => {
    expect(ratioBucket(100, 9)).toBe('<10%')
    expect(ratioBucket(100, 30)).toBe('30-50%')
    expect(ratioBucket(100, 150)).toBe('>=90%')
    expect(ratioBucket(0, 5)).toBe('>=90%')
  })
  it('durationBucket and progressBucket, including NaN and null', () => {
    expect(durationBucket(14.9)).toBe('<15')
    expect(durationBucket(60)).toBe('60-300')
    expect(durationBucket(1200)).toBe('>=1200')
    expect(durationBucket(Number.NaN)).toBe('<15')
    expect(sizeBucket(Number.NaN)).toBe('<10')
    expect(progressBucket(null)).toBe('0-25%')
    expect(progressBucket(0.5)).toBe('50-75%')
    expect(progressBucket(1)).toBe('75-100%')
  })
})

describe('props', () => {
  it('presetProp keeps built-in ids and hides user presets', () => {
    expect(presetProp('discord')).toBe('discord')
    expect(presetProp('user-1700000000000')).toBe('custom')
    expect(presetProp('')).toBe('custom')
  })
  it('extProp only reveals known video extensions', () => {
    expect(extProp('C:\\a\\Clip.MOV')).toBe('mov')
    expect(extProp('C:\\a\\archive.tar.mkv')).toBe('mkv')
    expect(extProp('C:\\my.folder\\video')).toBe('other')
    expect(extProp('C:\\a\\notes.secretproject')).toBe('other')
    expect(extProp('')).toBe('other')
  })
  it('modeProp and encodersProp', () => {
    expect(modeProp(settings)).toBe('target')
    expect(modeProp({ ...settings, maxMB: null, bitrateKbps: 8000 })).toBe('bitrate')
    expect(modeProp({ ...settings, maxMB: null })).toBe('quality')
    expect(encodersProp(['nvenc', 'cpu'])).toBe('cpu,nvenc')
  })
  it('isRendererEvent accepts only the promo events', () => {
    expect(isRendererEvent('promo_clicked')).toBe(true)
    expect(isRendererEvent('encode_done')).toBe(false)
    expect(isRendererEvent({ name: 'promo_clicked' })).toBe(false)
  })
})

describe('encodeEvent', () => {
  it('maps a success to encode_done without any path', () => {
    const outcome: EncodeOutcome = {
      ok: true,
      result: { output: 'C:\\Users\\Lou\\Videos\\secret client_squish.mp4', bytes: 9_500_000, encoder: 'nvenc', fellBack: false, attempts: 2 }
    }
    const e = encodeEvent({ ...base, outcome })
    expect(e).toEqual({
      name: 'encode_done',
      props: {
        preset: 'discord', edited: false, codec: 'h264', res: '1080', fps: 'best', mode: 'target', encoder: 'nvenc',
        gpu_fallback: false, attempts: 2, input_mb: '100-500', ratio: '<10%', duration: '15-60'
      }
    })
    expect(JSON.stringify(e)).not.toMatch(/secret|Lou|\\/)
  })
  it('maps an abort to encode_cancelled with a progress bucket', () => {
    const outcome: EncodeOutcome = { ok: false, kind: 'aborted', message: 'Cancelled', log: '' }
    expect(encodeEvent({ ...base, outcome })).toEqual({ name: 'encode_cancelled', props: { progress: '50-75%' } })
  })
  it('maps failures to encode_failed and drops message and log', () => {
    const outcome: EncodeOutcome = { ok: false, kind: 'disk', message: 'Not enough disk space to write C:\\Users\\Lou\\x.mp4', log: 'C:\\Users\\Lou' }
    const e = encodeEvent({ ...base, meta: { presetId: 'user-5', edited: true }, outcome })
    expect(e).toEqual({ name: 'encode_failed', props: { kind: 'disk', preset: 'custom', codec: 'h264', encoder_choice: 'auto', encoders: 'cpu,nvenc' } })
  })
})
