import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ProfileControl from './components/ProfileControl.tsx';
import PassRegeneratorControl from './components/PassRegeneratorControl.tsx';
import NotificationCenter from './components/NotificationCenter.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ProfileControl />
    <PassRegeneratorControl />
    <NotificationCenter />
  </StrictMode>,
);
