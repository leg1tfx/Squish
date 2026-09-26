import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/jetbrains-mono/500.css'
import { continueRender, delayRender } from 'remotion'

const handle = delayRender('Loading fonts')
Promise.all([
  document.fonts.load("400 48px 'Inter'"),
  document.fonts.load("600 48px 'Inter'"),
  document.fonts.load("600 48px 'Fraunces'"),
  document.fonts.load("500 48px 'JetBrains Mono'")
]).then(() => continueRender(handle))
