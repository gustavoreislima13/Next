import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Wallet, Tag, 
  StickyNote, FolderOpen, Bot, Settings, LogOut, Sun, Moon 
} from 'lucide-react';
import { db } from '../services/db';
import { User } from '../types';
import { useTheme } from './ThemeContext';
import Dock from './Dock';
import Beams from './Beams';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/crm', label: 'CRM', icon: Users },
  { path: '/financeiro', label: 'Financeiro', icon: Wallet },
  { path: '/precificacao', label: 'Precificação', icon: Tag },
  { path: '/mural', label: 'Mural', icon: StickyNote },
  { path: '/arquivos', label: 'Arquivos', icon: FolderOpen },
  { path: '/ia', label: 'I.A. Nexus', icon: Bot },
  { path: '/config', label: 'Config', icon: Settings },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<User | null>(db.getCurrentUser());

  useEffect(() => {
    const loadUser = () => setUser(db.getCurrentUser());
    loadUser();
    window.addEventListener('profile-updated', loadUser);
    return () => window.removeEventListener('profile-updated', loadUser);
  }, []);

  const handleLogout = () => {
    db.logout();
    navigate('/login');
  };

  // Convert navItems to Dock format
  const dockItems = navItems.map(item => ({
    icon: <item.icon size={24} />,
    label: item.label,
    onClick: () => navigate(item.path),
    className: location.pathname === item.path ? 'ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50 dark:bg-slate-700' : ''
  }));

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300 relative">
      
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 opacity-50 pointer-events-none">
        <Beams 
          lightColor={theme === 'dark' ? '#ffffff' : '#94a3b8'} 
          noiseIntensity={theme === 'dark' ? 1.75 : 0.8}
        />
      </div>

      {/* Universal Top Header */}
      <header className="h-16 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-8 z-40 transition-colors relative">
        {/* Brand */}
        <div className="flex items-center gap-3 font-bold text-xl tracking-tight text-slate-900 dark:text-white">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            N
          </div>
          <span className="hidden sm:inline">NEXUS OS</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Theme Toggle */}
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            title={theme === 'light' ? "Mudar para Modo Escuro" : "Mudar para Modo Claro"}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {/* User Profile */}
          <button 
            onClick={() => navigate('/config?tab=profile')} 
            className="flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          >
             <div className="relative">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700" alt="User" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white uppercase border border-emerald-400 shadow-sm">
                    {(user?.name || 'U').substring(0, 2)}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
             </div>
             <div className="hidden sm:block text-left">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-none">{user?.name || 'Usuário'}</p>
                <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{user?.role || 'Membro'}</p>
             </div>
          </button>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 mx-1"></div>

          {/* Logout */}
          <button 
            onClick={handleLogout} 
            className="text-slate-400 hover:text-rose-500 transition-colors p-2"
            title="Sair do Sistema"
          >
             <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative w-full custom-scrollbar z-10">
        {/* Container centered with max-width */}
        <div className="w-full max-w-7xl mx-auto p-4 md:p-8 pb-32">
          {children}
        </div>
      </main>

      {/* Navigation Dock (Fixed at bottom) */}
      <Dock 
        items={dockItems} 
        panelHeight={68}
        baseItemSize={50}
        magnification={70}
      />
    </div>
  );
};