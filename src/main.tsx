import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallbackTitle="Bidou AI Workspace"
      fallbackMessage="An unexpected issue occurred while rendering the workspace. Click below to reload cleanly."
      onReset={() => {
        window.location.reload();
      }}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

