import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/tokens.css'
import './styles/app.css'

const host = document.getElementById('root')
if (host === null) throw new Error('missing #root element')

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
