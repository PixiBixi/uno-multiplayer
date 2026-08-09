import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { ErrorBoundary } from './components/ErrorBoundary.js'
import { LocaleProvider } from './i18n/LocaleProvider.js'
import './styles/tokens.css'
import './styles/app.css'

const host = document.getElementById('root')
if (host === null) throw new Error('missing #root element')

createRoot(host).render(
  <StrictMode>
    {/* Outside App, so a throw anywhere inside it — including in the socket hook
        that feeds every screen — still lands somewhere. */}
    {/* Outside the boundary too, so even the crash screen speaks the language. */}
    <LocaleProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </LocaleProvider>
  </StrictMode>,
)
