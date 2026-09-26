import type { FC } from 'react'
import type { SceneId, SceneTiming } from '../timeline'
import { Hook } from './Hook'
import { Placeholder } from './Placeholder'
import { Title } from './Title'

export type SceneProps = { t: SceneTiming }

// Tasks 5–8 replace each entry with its real scene.
export const SCENE_COMPONENTS: Record<SceneId, FC<SceneProps>> = {
  hook: Hook, title: Title, hero: Placeholder,
  countdown: Placeholder, triplet: Placeholder, endcard: Placeholder
}
