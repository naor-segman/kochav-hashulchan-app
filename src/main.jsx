import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SupportButton from './components/support/SupportButton.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
        <SupportButton />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
