import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { User } from '../types';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const list = await db.getUsers();
        setUsers(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  const handleLogin = async (userId: string) => {
    const success = await db.login(userId);
    if (success) {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center animate-fade-in flex flex-col items-center">
        <Logo size={80} textClassName="text-white text-3xl mt-4" className="flex-col !gap-2" />
        <p className="text-slate-400 mt-2">Selecione seu perfil para acessar o sistema</p>
      </div>

      <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 shadow-xl overflow-hidden animate-fade-in">
        <div className="p-6">
          <div className="space-y-3">
            {loading ? (
              <div className="text-center text-slate-500 py-8">Carregando usuários...</div>
            ) : (
              users.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleLogin(user.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 hover:shadow-lg transition-all border border-transparent hover:border-slate-600 group text-left"
                >
                  <div className="relative">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full object-cover border-2 border-slate-600 group-hover:border-blue-500 transition-colors" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-lg font-bold text-white border-2 border-slate-500 group-hover:border-blue-500 transition-colors">
                        {user.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    {user.role === 'Admin' && (
                      <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-0.5 border-2 border-slate-800" title="Admin">
                        <ShieldCheck size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{user.name}</h3>
                    <p className="text-xs text-slate-400">{user.role}</p>
                  </div>
                  
                  <LogIn className="text-slate-500 group-hover:text-white transition-colors opacity-0 group-hover:opacity-100" size={20} />
                </button>
              ))
            )}
          </div>
        </div>
        
        <div className="bg-slate-900/50 p-4 text-center text-xs text-slate-500 border-t border-slate-700">
           Acesso restrito e monitorado via Log de Auditoria.
        </div>
      </div>
    </div>
  );
};