import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastContext';
import { ThemeProvider } from './components/ThemeContext';
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

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = db.getCurrentUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return (
    <Layout>
      {children}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute><CRM /></ProtectedRoute>} />
            <Route path="/financeiro" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
            <Route path="/precificacao" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
            <Route path="/mural" element={<ProtectedRoute><Mural /></ProtectedRoute>} />
            <Route path="/arquivos" element={<ProtectedRoute><Files /></ProtectedRoute>} />
            <Route path="/ia" element={<ProtectedRoute><AI /></ProtectedRoute>} />
            <Route path="/config" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;