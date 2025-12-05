import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Wallet, Tag, 
  StickyNote, FolderOpen, Bot, Settings, Menu, X 
} from 'lucide-react';
import { db } from '../services/db';
import { UserProfile } from '../types';

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
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(db.getUserProfile());
  const location = useLocation();

  useEffect(() => {
    // Listen for updates in local storage or simply refresh on mount
    const loadProfile = () => setProfile(db.getUserProfile());
    loadProfile();
    
    // Add event listener for profile updates if we trigger them
    window.addEventListener('profile-updated', loadProfile);
    return () => window.removeEventListener('profile-updated', loadProfile);
  }, []);

  const toggleMobile = () => setIsMobileOpen(!isMobileOpen);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar Desktop & Mobile */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 transition-transform transform 
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:relative md:translate-x-0 flex flex-col
      `}>
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
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
              <NavLink
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
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="User" className="w-9 h-9 rounded-full object-cover border border-slate-500 bg-slate-800" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white uppercase border border-emerald-400">
                {(profile.name || 'User').substring(0, 2)}
              </div>
            )}
            <div className="text-sm overflow-hidden">
              <p className="font-medium text-white truncate">{profile.name || 'Usuário'}</p>
              <p className="text-xs text-slate-400 truncate">{profile.role || 'Membro'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 md:hidden justify-between shrink-0">
          <button onClick={toggleMobile} className="text-slate-600">
            <Menu size={24} />
          </button>
          <span className="font-bold text-slate-800">NEXUS</span>
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