import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { TitleBar } from './components/TitleBar'
import { enter } from './motion'
import { CompareScreen } from './screens/CompareScreen'
import { DoneScreen } from './screens/DoneScreen'
import { DropScreen } from './screens/DropScreen'
import { EncodingScreen } from './screens/EncodingScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useSquish } from './state/store'

const SCREENS = { drop: DropScreen, settings: SettingsScreen, compare: CompareScreen, encoding: EncodingScreen, done: DoneScreen }

export function App() {
  const screen = useSquish((s) => s.screen)
  const [about, setAbout] = useState(false)
  useEffect(() => { void useSquish.getState().init() }, [])
  const Current = SCREENS[screen]
  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <TitleBar onAbout={() => setAbout(true)} />
        <AnimatePresence mode="wait">
          <motion.main key={screen} className="screen" variants={enter} initial="hidden" animate="show" exit="exit">
            <Current />
          </motion.main>
        </AnimatePresence>
        <AboutDialog open={about} onClose={() => setAbout(false)} />
      </div>
    </MotionConfig>
  )
}
