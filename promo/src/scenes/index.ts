import type { FC } from 'react'
import type { SceneId, SceneTiming } from '../timeline'
import { Placeholder } from './Placeholder'

export type SceneProps = { t: SceneTiming }

// Tasks 5–8 replace each entry with its real scene.
export const SCENE_COMPONENTS: Record<SceneId, FC<SceneProps>> = {
  hook: Placeholder, title: Placeholder, hero: Placeholder,
  countdown: Placeholder, triplet: Placeholder, endcard: Placeholder
}
