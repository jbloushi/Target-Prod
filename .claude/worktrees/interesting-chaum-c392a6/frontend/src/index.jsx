import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './ui/tokens.css';
import App from './App';

const isLandingPage = window.location.pathname === '/' || window.location.pathname === '/index.html';
const landingShell = document.getElementById('landing-page-shell');
const rootElement = document.getElementById('root');

if (!isLandingPage) {
  landingShell?.classList.add('hidden');
  if (rootElement) rootElement.style.display = 'block';
}

const root = ReactDOM.createRoot(document.getElementById('root'));

if (isLandingPage) {
  console.log('Target Logistics: Static Landing Page Active. Skipping React mount.');
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
