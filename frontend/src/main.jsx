import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Apply platform classes synchronously so CSS variables are correct before first paint
if (navigator.userAgent.includes('Electron')) {
  document.documentElement.classList.add('is-electron')
  if (navigator.platform.startsWith('Mac')) {
    document.documentElement.classList.add('is-electron-mac')
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
