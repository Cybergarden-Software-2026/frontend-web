import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './reference.css';
import './analytics.css';
import './styles.css';
import './dashboard.css';
import './header-wave.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
