import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { AuthProvider, SiteProvider, ThemeProvider, ToastProvider } from './context/AppContext.jsx';
import { ReauthProvider } from './context/Reauth.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SiteProvider>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <ReauthProvider>
                <App />
              </ReauthProvider>
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </SiteProvider>
    </BrowserRouter>
  </StrictMode>,
);
