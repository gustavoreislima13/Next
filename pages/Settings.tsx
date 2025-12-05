import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { AppSettings, Client, Transaction, UserProfile } from '../types';
import { Save, Database, Key, CheckCircle, AlertCircle, ExternalLink, Download, Upload, FileText, User, Camera } from 'lucide-react';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(db.getLocalSettings());
  const [profile, setProfile] = useState<UserProfile>(db.getUserProfile());
  const [activeTab, setActiveTab] = useState('general');
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  useEffect(() => {
     db.getSettings().then(setSettings);
     setIsSupabaseConnected(db.isSupabaseConfigured());
  }, []);

  const handleSave = async () => {
    await db.updateSettings(settings);
    await db.saveUserProfile(profile);
    window.dispatchEvent(new Event('profile-updated'));
    alert('Configurações salvas com sucesso!');
    window.location.reload(); 
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("A imagem deve ter no máximo 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile({ ...profile, avatarUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const arrayToCSV = (data: any[]) => {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    return [
      headers.join(','),
      ...data.map(row => headers.map(h => typeof row[h] === 'string' ? `"${row[h]}"` : row[h]).join(','))
    ].join('\n');
  };

  const handleExport = async (type: 'clients' | 'tx') => {
    const data = type === 'clients' ? await db.getClients() : await db.getTransactions();
    const blob = new Blob([arrayToCSV(data)], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `nexus_${type}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>

      <div className="flex border-b border-slate-200 overflow-x-auto gap-4">
        {['general', 'profile', 'registers', 'import', 'api'].map(tab => (
           <button 
             key={tab}
             onClick={() => setActiveTab(tab)}
             className={`pb-2 px-1 capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'}`}
           >
             {tab === 'api' ? 'Integrações' : tab === 'import' ? 'Dados' : tab === 'registers' ? 'Cadastros' : tab === 'general' ? 'Geral' : 'Perfil'}
           </button>
        ))}
      </div>

      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        {activeTab === 'general' && (
          <div className="space-y-4 max-w-lg">
             <div>
               <label className="block text-sm font-bold text-slate-700 mb-1">Razão Social</label>
               <input className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} />
             </div>
             <div>
               <label className="block text-sm font-bold text-slate-700 mb-1">CNPJ</label>
               <input className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={settings.cnpj} onChange={e => setSettings({...settings, cnpj: e.target.value})} />
             </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="max-w-xl">
             <div className="flex items-center gap-6 mb-8">
               <div className="relative group shrink-0">
                 <div className="w-24 h-24 rounded-full border-4 border-slate-100 shadow-md overflow-hidden bg-slate-200">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <User size={40} />
                      </div>
                    )}
                 </div>
                 <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 shadow-sm transition-colors">
                   <Camera size={16} />
                   <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                 </label>
               </div>
               <div>
                 <h3 className="text-lg font-bold text-slate-900">Foto de Perfil</h3>
                 <p className="text-sm text-slate-500">Isso será exibido na barra lateral.</p>
               </div>
             </div>

             <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Nome de Exibição</label>
                  <input 
                    className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                    value={profile.name} 
                    onChange={e => setProfile({...profile, name: e.target.value})} 
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Cargo / Função</label>
                  <input 
                    className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                    value={profile.role} 
                    onChange={e => setProfile({...profile, role: e.target.value})} 
                    placeholder="Ex: Gerente"
                  />
                </div>
             </div>
          </div>
        )}

        {activeTab === 'registers' && (
           <div className="space-y-4">
             <p className="text-sm text-slate-500 bg-blue-50 p-3 rounded-lg text-blue-700">Separe os itens por vírgula para criar múltiplas opções nos formulários.</p>
             <div>
               <label className="block text-sm font-bold text-slate-700 mb-1">Empresas (Entidades)</label>
               <textarea className="w-full border border-slate-300 p-3 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 outline-none" value={settings.entities.join(', ')} onChange={e => setSettings({...settings, entities: e.target.value.split(',').map(s=>s.trim())})} />
             </div>
             <div>
               <label className="block text-sm font-bold text-slate-700 mb-1">Categorias Financeiras</label>
               <textarea className="w-full border border-slate-300 p-3 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 outline-none" value={settings.categories.join(', ')} onChange={e => setSettings({...settings, categories: e.target.value.split(',').map(s=>s.trim())})} />
             </div>
           </div>
        )}

        {activeTab === 'import' && (
           <div className="space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="border border-slate-200 p-6 rounded-xl text-center hover:border-blue-300 transition-colors">
                 <h4 className="font-bold mb-2 text-slate-900">Clientes</h4>
                 <p className="text-sm text-slate-500 mb-4">Exporte sua base de clientes para CSV.</p>
                 <button onClick={() => handleExport('clients')} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2 w-full">
                   <Download size={16} /> Download CSV
                 </button>
               </div>
               <div className="border border-slate-200 p-6 rounded-xl text-center hover:border-blue-300 transition-colors">
                 <h4 className="font-bold mb-2 text-slate-900">Financeiro</h4>
                 <p className="text-sm text-slate-500 mb-4">Exporte todas as transações para CSV.</p>
                 <button onClick={() => handleExport('tx')} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2 w-full">
                   <Download size={16} /> Download CSV
                 </button>
               </div>
             </div>
           </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-6">
             <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
               <label className="block text-sm font-bold text-purple-900 mb-2">Gemini API Key (Google AI)</label>
               <div className="relative">
                 <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" size={18} />
                 <input 
                   type="password" 
                   className="w-full border border-purple-200 rounded-lg p-2.5 pl-10 focus:ring-2 focus:ring-purple-500 outline-none" 
                   value={settings.geminiApiKey || ''} 
                   onChange={e => setSettings({...settings, geminiApiKey: e.target.value})} 
                   placeholder="Cole sua chave AIza..."
                 />
               </div>
             </div>

             <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100">
               <div className="flex items-center gap-2 mb-4">
                 <Database className="text-emerald-600" size={20} />
                 <h3 className="font-bold text-emerald-900">Conexão Supabase</h3>
                 {isSupabaseConnected && <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-bold">CONECTADO</span>}
               </div>
               
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-bold text-emerald-900 mb-1">Project URL</label>
                   <input className="w-full border border-emerald-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" value={settings.supabaseUrl || ''} onChange={e => setSettings({...settings, supabaseUrl: e.target.value})} placeholder="https://..." />
                 </div>
                 <div>
                   <label className="block text-sm font-bold text-emerald-900 mb-1">API Key (anon/public)</label>
                   <input type="password" className="w-full border border-emerald-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" value={settings.supabaseKey || ''} onChange={e => setSettings({...settings, supabaseKey: e.target.value})} />
                 </div>
               </div>
             
               <div className="mt-6">
                 <p className="text-sm font-bold text-emerald-800 mb-2">Configuração do Banco de Dados (SQL)</p>
                 <div className="bg-slate-800 text-slate-300 p-4 rounded-lg text-xs font-mono overflow-auto h-48 border border-slate-700">
<pre>{`-- ATENÇÃO: Execute este script no SQL Editor do Supabase para configurar as tabelas.

-- 1. Criar Tabelas
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY, 
  name text, 
  cpf text, 
  mobile text, 
  email text, 
  "createdAt" text
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY, 
  type text, 
  description text, 
  amount numeric, 
  date text, 
  entity text, 
  category text, 
  "clientId" text, 
  "serviceType" text, 
  consultant text, 
  supplier text, 
  observation text, 
  "attachmentIds" text[]
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY, 
  title text, 
  content text, 
  color text, 
  x numeric, 
  y numeric
);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY, 
  name text, 
  type text, 
  size text, 
  date text, 
  "associatedClient" text, 
  "associatedTransactionId" text
);

-- 2. Atualizações de Schema (para bancos existentes)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "attachmentIds" text[];
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "observation" text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS "associatedClient" text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS "associatedTransactionId" text;

-- 3. Configurar Realtime
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE clients, transactions, notes, files;

-- 4. Políticas de Segurança (Row Level Security - Público)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON clients;
CREATE POLICY "Public Access" ON clients FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON transactions;
CREATE POLICY "Public Access" ON transactions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON notes;
CREATE POLICY "Public Access" ON notes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON files;
CREATE POLICY "Public Access" ON files FOR ALL USING (true) WITH CHECK (true);
`}</pre>
                 </div>
               </div>
             </div>
          </div>
        )}
        
        <div className="mt-8 flex justify-end pt-6 border-t border-slate-100">
          <button onClick={handleSave} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
            <Save size={20} /> Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};