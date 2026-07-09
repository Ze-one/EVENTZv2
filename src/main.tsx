import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PassRegeneratorControl from './components/PassRegeneratorControl.tsx';
import NotificationCenter from './components/NotificationCenter.tsx';
import HeaderAccountControl from './components/HeaderAccountControl.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PassRegeneratorControl />
    <NotificationCenter />
    <HeaderAccountControl />
  </StrictMode>,
);
