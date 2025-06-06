import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@cloudscape-design/global-styles/index.css';

const suppressResizeObserverError = () => {
  const resizeObserverError = () => {
    const resizeObserverErrDiv = document.getElementById('webpack-dev-server-client-overlay-div');
    const resizeObserverErr = document.getElementById('webpack-dev-server-client-overlay');
    if (resizeObserverErrDiv) {
      resizeObserverErrDiv.setAttribute('style', 'display: none');
    }
    if (resizeObserverErr) {
      resizeObserverErr.setAttribute('style', 'display: none');
    }
  };

  window.addEventListener('error', (e) => {
    if (e.message.includes('ResizeObserver loop completed')) {
      const resizeObserverErrDiv = document.getElementById('webpack-dev-server-client-overlay-div');
      const resizeObserverErr = document.getElementById('webpack-dev-server-client-overlay');
      if (resizeObserverErrDiv) {
        resizeObserverErrDiv.setAttribute('style', 'display: none');
      }
      if (resizeObserverErr) {
        resizeObserverErr.setAttribute('style', 'display: none');
      }
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason?.message?.includes('ResizeObserver loop completed')) {
      e.preventDefault();
    }
  });
};

suppressResizeObserverError();


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <App />
);

