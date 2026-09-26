import type { FC } from 'react'
import type { SceneId, SceneTiming } from '../timeline'
import { Countdown } from './Countdown'
import { Endcard } from './Endcard'
import { Hero } from './Hero'
import { Hook } from './Hook'
import { Title } from './Title'
import { Triplet } from './Triplet'

export type SceneProps = { t: SceneTiming }

export const SCENE_COMPONENTS: Record<SceneId, FC<SceneProps>> = {
  hook: Hook, title: Title, hero: Hero, countdown: Countdown, triplet: Triplet, endcard: Endcard
}
