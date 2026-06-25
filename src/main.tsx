import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept all API requests to route them to VITE_API_URL if configured (e.g. for Netlify deployments)
const apiBaseUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
if (apiBaseUrl) {
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("/api/")) {
      const formattedBase = apiBaseUrl.replace(/\/$/, "");
      url = `${formattedBase}${url}`;
    }
    if (typeof input === "string") {
      return originalFetch(url, init);
    } else if (input instanceof URL) {
      return originalFetch(new URL(url), init);
    } else {
      const newRequest = new Request(url, input);
      return originalFetch(newRequest, init);
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
