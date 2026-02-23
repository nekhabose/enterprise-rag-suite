import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global CSS reset and base styles
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #0f0f1a;
    color: #fff;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }
  input, button, select, textarea { font-family: inherit; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  /* NavLink active state */
  .nav-active {
    background: rgba(124, 58, 237, 0.15) !important;
    color: #fff !important;
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
