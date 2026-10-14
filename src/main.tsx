import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { DbProvider } from './db/DbProvider.tsx';
import { HotshoeDb } from './db/database.ts';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <DbProvider db={new HotshoeDb()}>
      <App />
    </DbProvider>
  </StrictMode>,
);
