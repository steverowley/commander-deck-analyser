import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { registerServiceWorker } from './sw-register.js';
import { applyThemeMode, getThemeMode } from './lib/themeMode.js';
import './index.css';

applyThemeMode(getThemeMode());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerServiceWorker();
