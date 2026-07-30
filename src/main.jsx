import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SupportButton from './components/support/SupportButton.jsx'
import { installGlobalErrorReporting } from "./utils/errorReport.js";

// Anything that never reaches a React boundary — a listener that throws, an
// unawaited rejection, a lazy chunk that 404s after a deploy.
installGlobalErrorReporting();

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
