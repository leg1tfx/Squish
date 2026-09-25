/// <reference types="vite/client" />
import type { SquishApi } from '@shared/api'
declare global { interface Window { squish: SquishApi } }
export {}
