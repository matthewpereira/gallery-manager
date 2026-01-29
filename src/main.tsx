import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { StorageProviderContext } from './contexts/StorageContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Set basename for GitHub Pages deployment
const basename = import.meta.env.MODE === 'production' ? '/gallery-manager' : '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <StorageProviderContext>
            <App />
          </StorageProviderContext>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
