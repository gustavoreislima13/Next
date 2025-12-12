import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Wallet, Tag, 
  StickyNote, FolderOpen, Bot, Settings, Menu, X, LogOut, Sun, Moon 
} from 'lucide-react';
import { db } from '../services/db';
import { User } from '../types';
import { useTheme } from './ThemeContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/crm', label: 'CRM', icon: Users },
  { path: '/financeiro', label: 'Financeiro', icon: Wallet },
  { path: '/precificacao', label: 'Precificação', icon: Tag },
  { path: '/mural', label: 'Mural', icon: StickyNote },
  { path: '/arquivos', label: 'Arquivos', icon: FolderOpen },
  { path: '/ia', label: 'I.A. Nexus', icon: Bot },
  { path: '/config', label: 'Configurações', icon: Settings },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(db.getCurrentUser());

  useEffect(() => {
    const loadUser = () => setUser(db.getCurrentUser());
    loadUser();
    window.addEventListener('profile-updated', loadUser);
    return () => window.removeEventListener('profile-updated', loadUser);
  }, []);

  const toggleMobile = () => setIsMobileOpen(!isMobileOpen);

  const handleLogout = () => {
    db.logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300">
      {/* Sidebar Desktop & Mobile */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 dark:bg-slate-950 text-slate-100 transition-transform transform border-r border-slate-800
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:relative md:translate-x-0 flex flex-col
      `}>
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">N</div>
            NEXUS OS
          </div>
          <button className="md:hidden ml-auto" onClick={toggleMobile}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                `}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
           {/* Theme Toggle */}
           <button 
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full text-left text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-2 rounded-lg text-sm transition-colors mb-2"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            {theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}
          </button>

          <button 
            onClick={() => navigate('/config?tab=profile')}
            className="flex items-center gap-3 w-full text-left hover:bg-slate-800 p-2 rounded-lg transition-colors group"
            title="Editar Perfil"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="User" className="w-9 h-9 rounded-full object-cover border border-slate-500 bg-slate-800 group-hover:border-slate-400" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white uppercase border border-emerald-400 group-hover:border-emerald-300">
                {(user?.name || 'User').substring(0, 2)}
              </div>
            )}
            <div className="text-sm overflow-hidden flex-1">
              <p className="font-medium text-white truncate group-hover:text-blue-200 transition-colors">{user?.name || 'Usuário'}</p>
              <p className="text-xs text-slate-400 truncate">{user?.role || 'Membro'}</p>
            </div>
          </button>

          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full text-left text-slate-400 hover:text-rose-400 hover:bg-slate-800 px-3 py-2 rounded-lg text-sm transition-colors"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 md:hidden justify-between shrink-0 transition-colors">
          <button onClick={toggleMobile} className="text-slate-600 dark:text-slate-300">
            <Menu size={24} />
          </button>
          <span className="font-bold text-slate-800 dark:text-white">NEXUS</span>
          <div className="w-6" /> {/* Spacer */}
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </div>
  );
};