import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { StorageProviderContext } from './contexts/StorageContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StorageProviderContext>
          <App />
        </StorageProviderContext>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
