import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastContext';
import { db } from './services/db';

// Pages
import { Dashboard } from './pages/Dashboard';
import { CRM } from './pages/CRM';
import { Finance } from './pages/Finance';
import { Pricing } from './pages/Pricing';
import { Mural } from './pages/Mural';
import { Files } from './pages/Files';
import { AI } from './pages/AI';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';

const ProtectedRoute = () => {
  const user = db.getCurrentUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Layout><Outlet /></Layout>;
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/financeiro" element={<Finance />} />
            <Route path="/precificacao" element={<Pricing />} />
            <Route path="/mural" element={<Mural />} />
            <Route path="/arquivos" element={<Files />} />
            <Route path="/ia" element={<AI />} />
            <Route path="/config" element={<Settings />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
};

export default App;