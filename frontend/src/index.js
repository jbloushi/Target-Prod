import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './ui/tokens.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Optimization: Skip React rendering for the home page (static landing page)
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  console.log('Target Logistics: Static Landing Page Active. Skipping React mount.');
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

