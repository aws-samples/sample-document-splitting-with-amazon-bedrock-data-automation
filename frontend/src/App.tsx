import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppLayout, TopNavigation } from '@cloudscape-design/components';
import '@cloudscape-design/global-styles/index.css';

import Dashboard from './pages/dashboard/Dashboard';
import Demo from './pages/demo/Demo';
import Analysis from './pages/analysis/Analysis';
import Navigation from './components/common/Navigation';

const App: React.FC = () => {
  return (
    <Router>
      <div id="app">
        <TopNavigation
          identity={{
            href: '/',
            title: 'Document Splitting with Amazon Bedrock Data Automation',
            // logo: { src: '/logo.png', alt: 'HotB Software' }
          }}
        />

        <AppLayout
          navigation={<Navigation />}
          content={
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/analysis" element={<Analysis />} />
            </Routes>
          }
          toolsHide
          navigationHide={false}
        />
      </div>
    </Router>
  );
};

export default App;
