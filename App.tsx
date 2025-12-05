import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';

// Pages
import { Dashboard } from './pages/Dashboard';
import { CRM } from './pages/CRM';
import { Finance } from './pages/Finance';
import { Pricing } from './pages/Pricing';
import { Mural } from './pages/Mural';
import { Files } from './pages/Files';
import { AI } from './pages/AI';
import { Settings } from './pages/Settings';

const App: React.FC = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/financeiro" element={<Finance />} />
          <Route path="/precificacao" element={<Pricing />} />
          <Route path="/mural" element={<Mural />} />
          <Route path="/arquivos" element={<Files />} />
          <Route path="/ia" element={<AI />} />
          <Route path="/config" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;