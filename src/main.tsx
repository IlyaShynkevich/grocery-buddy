import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { MascotLabPage } from './features/mascot-lab/MascotLabPage'
import { MASCOT_LAB_ENABLED } from './features/mascot-lab/mascotLab'

registerSW({ immediate: true })

// Browsers throttle their own automatic SW update check to roughly once
// per 24h — this forces a check on every load instead of waiting on that
// timer, so a new deploy (e.g. the auth gate itself) propagates to a
// returning visitor as fast as realistically possible. Can't help an
// already-open tab still running old JS (it isn't running this line yet,
// by definition) — only shortens the gap for every load from here on.
navigator.serviceWorker?.getRegistration().then((registration) => registration?.update())

// TEMPORARY — ?mascot=1 mounts the mascot idle-animation comparison page
// instead of the app, and nothing else. Branching here rather than inside
// App keeps App's hooks out from behind a condition, and makes removing
// the demo these two imports, this ternary, and src/features/mascot-lab/.
// See mascotLab.ts.
createRoot(document.getElementById('root')!).render(
  <StrictMode>{MASCOT_LAB_ENABLED ? <MascotLabPage /> : <App />}</StrictMode>,
)
