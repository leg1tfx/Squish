import type { FC } from 'react'
import type { SceneId, SceneTiming } from '../timeline'
import { Countdown } from './Countdown'
import { Hero } from './Hero'
import { Hook } from './Hook'
import { Placeholder } from './Placeholder'
import { Title } from './Title'
import { Triplet } from './Triplet'

export type SceneProps = { t: SceneTiming }

// Tasks 5–8 replace each entry with its real scene.
export const SCENE_COMPONENTS: Record<SceneId, FC<SceneProps>> = {
  hook: Hook, title: Title, hero: Hero,
  countdown: Countdown, triplet: Triplet, endcard: Placeholder
}
