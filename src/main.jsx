import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SupportButton from './components/support/SupportButton.jsx'
import ConsentBanner from './components/consent/ConsentBanner.jsx'
import { installGlobalErrorReporting } from "./utils/errorReport.js";
import { initAnalytics } from "./lib/analytics.js";

// Anything that never reaches a React boundary — a listener that throws, an
// unawaited rejection, a lazy chunk that 404s after a deploy.
installGlobalErrorReporting();

// Dark until VITE_POSTHOG_KEY exists AND this browser has said yes to the
// cookie question (ConsentBanner): no key or no yes — no load, no requests.
initAnalytics();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
        <SupportButton />
        <ConsentBanner />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
