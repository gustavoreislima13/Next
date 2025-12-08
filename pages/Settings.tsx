import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../services/db';
import { AppSettings, Client, Transaction, UserProfile, User, AuditLog } from '../types';
import { generateBusinessInsight } from '../services/geminiService';
import { Save, Database, Key, CheckCircle, AlertCircle, ExternalLink, Download, Upload, FileText, User as UserIcon, Camera, FileUp, Sparkles, RefreshCw, Users, Shield, Trash2, History, Activity, ArrowDownCircle, ArrowUpCircle, MousePointer2 } from 'lucide-react';

export const Settings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<AppSettings>(db.getLocalSettings());
  const [profile, setProfile] = useState<UserProfile>(db.getUserProfile());
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'general');
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);
  
  // Team & Logs
  const [team, setTeam] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [newUser, setNewUser] = useState({ name: '', role: 'Vendedor', email: '' });
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importLog, setImportLog] = useState('');
  const [importTxType, setImportTxType] = useState<'auto' | 'income' | 'expense'>('auto');

  useEffect(() => {
     db.getSettings().then(setSettings);
     setIsSupabaseConnected(db.isSupabaseConfigured());
     loadTeamAndLogs();
     setCurrentUser(db.getCurrentUser());
  }, []);

  const loadTeamAndLogs = async () => {
    const users = await db.getUsers();
    setTeam(users);
    const activity = await db.getLogs();
    setLogs(activity);
  };

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

  // Team Functions
  const handleAddUser = async () => {
    if (!newUser.name) return;
    if (team.length >= 6) { // 1 Admin + 5 Staff
      alert("Limite de 6 usuários atingido (1 Admin + 5 Equipe).");
      return;
    }
    const u: User = {
      id: crypto.randomUUID(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      createdAt: new Date().toISOString()
    };
    try {
      await db.saveUser(u);
      setNewUser({ name: '', role: 'Vendedor', email: '' });
      loadTeamAndLogs();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if(!confirm("Tem certeza? O histórico deste usuário será mantido.")) return;
    try {
      await db.deleteUser(id);
      loadTeamAndLogs();
    } catch (e: any) {
      alert(e.message);
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

  // --- Smart CSV Parsing ---
  const normalizeHeader = (h: string) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    
    // Parse Headers
    const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const headers = rawHeaders.map(normalizeHeader);
    
    return lines.slice(1).map(line => {
      // Regex to split by comma but ignore commas inside quotes
      const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      
      const obj: any = {};
      
      // Generic Raw Mapping
      rawHeaders.forEach((h, i) => {
        let val = values[i]?.trim() || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        obj[h] = val;
      });

      // Smart Mapping to System Fields
      headers.forEach((h, i) => {
        let val = values[i]?.trim() || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);

        // Map Name
        if (['name', 'nome', 'cliente', 'nome do cliente', 'razao social', 'razao'].includes(h)) obj.mapped_name = val;
        // Map CPF/CNPJ
        if (['cpf', 'cnpj', 'documento', 'doc', 'cpf/cnpj'].includes(h)) obj.mapped_cpf = val;
        // Map Email
        if (['email', 'e-mail', 'mail', 'correio'].includes(h)) obj.mapped_email = val;
        // Map Mobile
        if (['mobile', 'celular', 'telefone', 'tel', 'whatsapp', 'phone'].includes(h)) obj.mapped_mobile = val;
        
        // Map Transaction Fields
        if (['amount', 'valor', 'preco', 'total'].includes(h)) obj.mapped_amount = val;
        if (['description', 'descricao', 'historico'].includes(h)) obj.mapped_desc = val;
        if (['date', 'data', 'dia'].includes(h)) obj.mapped_date = val;
      });

      return obj;
    });
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>, type: 'clients' | 'tx') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      try {
        const rows = parseCSV(text);
        if (rows.length === 0) {
            alert("Arquivo vazio ou formato inválido.");
            return;
        }
        
        if (type === 'clients') {
            const clients: Client[] = rows.map((r: any) => ({
                id: crypto.randomUUID(),
                // Use mapped fields if available, otherwise fallback or empty
                name: r.mapped_name || r.name || r.Nome || 'Sem Nome',
                cpf: r.mapped_cpf || r.cpf || '',
                mobile: r.mapped_mobile || r.mobile || '',
                email: r.mapped_email || r.email || '',
                createdAt: new Date().toISOString()
            }));

            // Filter out empty names
            const validClients = clients.filter(c => c.name !== 'Sem Nome' || c.cpf);

            await db.bulkUpsertClients(validClients);
            alert(`${validClients.length} clientes importados com sucesso!`);
        } else {
             const txs: Transaction[] = rows.map((r: any) => ({
                id: crypto.randomUUID(),
                type: (r.type === 'expense' || r.tipo === 'saida') ? 'expense' : 'income',
                description: r.mapped_desc || r.description || 'Importado via CSV',
                amount: Number(r.mapped_amount || r.amount || 0),
                date: r.mapped_date || r.date || new Date().toISOString(),
                entity: r.entity || 'Geral',
                category: r.category || 'Outros',
                observation: r.observation,
                clientId: r.clientId,
                serviceType: r.serviceType,
                consultant: r.consultant,
                supplier: r.supplier
            }));
            await db.bulkUpsertTransactions(txs);
            alert(`${txs.length} transações importadas com sucesso!`);
        }
        // Reset input
        e.target.value = '';
      } catch (error: any) {
        alert('Erro ao importar CSV: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  // --- PDF Import & Repair Logic ---

  const naiveRepairJSON = (jsonStr: string): string => {
    // 1. Basic Cleanup
    let cleaned = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

    // 2. Count brackets to detect truncation
    let openBraces = (cleaned.match(/{/g) || []).length;
    let closeBraces = (cleaned.match(/}/g) || []).length;
    let openBrackets = (cleaned.match(/\[/g) || []).length;
    let closeBrackets = (cleaned.match(/\]/g) || []).length;

    // 3. Append missing closing brackets
    // Order matters: usually we are inside an object inside an array, so close } then ]
    while (closeBraces < openBraces) {
      cleaned += "}";
      closeBraces++;
    }
    while (closeBrackets < openBrackets) {
      cleaned += "]";
      closeBrackets++;
    }

    return cleaned;
  };

  const handleLegacyPDFImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Por favor, selecione um arquivo PDF.");
      return;
    }

    setIsImporting(true);
    setImportLog('Lendo arquivo PDF em modo de ALTA CAPACIDADE (Batch Processing)...');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64 = (ev.target?.result as string).split(',')[1];
        setImportLog('Extraindo dados estruturados do documento... Aguarde...');
        
        let txInstruction = '';
        if (importTxType === 'income') {
          txInstruction = "Force 'type': 'income' para todas as transações.";
        } else if (importTxType === 'expense') {
          txInstruction = "Force 'type': 'expense' para todas as transações.";
        } else {
          txInstruction = "Determine 'income' ou 'expense' pelo contexto (Crédito/Débito).";
        }

        const prompt = `
          TAREFA: Extração em Massa de Dados (Bulk Data Extraction) - EXTREME PRECISION MODE.
          
          Analise o PDF fornecido. Extraia TODOS os Clientes e TODAS as Transações financeiras encontradas, linha por linha.
          
          SAÍDA ESPERADA:
          Retorne APENAS um objeto JSON válido.
          {
            "clients": [
              { "name": "Nome Completo", "cpf": "000...", "email": "...", "mobile": "..." }
            ],
            "transactions": [
              { "date": "YYYY-MM-DD", "description": "Descrição", "amount": 100.50, "type": "income/expense" }
            ]
          }

          REGRAS DE CLIENTES:
          - Procure por listas de nomes, pagadores, sacados, ou tabelas de cadastro.
          - Se houver CPF/CNPJ na mesma linha, capture.
          
          REGRAS DE TRANSAÇÕES:
          - ${txInstruction}
          - Extraia data, descrição e valor numérico.
          
          IMPORTANTE:
          - Capture TUDO. Se houver 500 linhas, retorne 500 objetos.
          - Se a resposta for ficar muito longa, finalize o JSON corretamente em vez de cortar no meio da sintaxe.
        `;

        const responseText = await generateBusinessInsight({
          prompt: prompt,
          document: base64,
          mode: 'thinking',
          responseMimeType: 'application/json' // Force strictly valid JSON output
        });

        // Try to parse, applying repair if necessary
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch (jsonError) {
          console.warn("JSON direto falhou, tentando reparo...", jsonError);
          const repaired = naiveRepairJSON(responseText);
          try {
            data = JSON.parse(repaired);
            setImportLog(prev => prev + "\n⚠️ JSON foi reparado automaticamente (truncamento detectado).");
          } catch (fatalError: any) {
            throw new Error(`Falha crítica ao ler JSON da IA: ${fatalError.message}. Tente um PDF menor.`);
          }
        }
        
        const newClients: Client[] = [];
        const newTxs: Transaction[] = [];

        if (data.clients && Array.isArray(data.clients)) {
          data.clients.forEach((c: any) => {
              if (c.name) {
                newClients.push({
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  name: c.name,
                  cpf: c.cpf || '',
                  mobile: c.mobile || '',
                  email: c.email || ''
                });
              }
          });
        }

        if (data.transactions && Array.isArray(data.transactions)) {
          data.transactions.forEach((t: any) => {
            if (t.description && t.amount) {
              newTxs.push({
                id: crypto.randomUUID(),
                type: t.type === 'expense' ? 'expense' : 'income',
                description: t.description,
                amount: Number(t.amount),
                date: t.date || new Date().toISOString(),
                entity: 'Importado',
                category: 'Geral'
              });
            }
          });
        }

        // Save to DB
        let logMsg = "Processamento Concluído.\n";
        if (newClients.length > 0) {
          await db.bulkUpsertClients(newClients);
          logMsg += `✅ ${newClients.length} Clientes cadastrados.\n`;
        }
        if (newTxs.length > 0) {
          await db.bulkUpsertTransactions(newTxs);
          logMsg += `✅ ${newTxs.length} Transações registradas.\n`;
        }

        if (newClients.length === 0 && newTxs.length === 0) {
          logMsg += "⚠️ Nenhum dado estruturado encontrado no formato esperado.";
        }

        setImportLog(logMsg);

      } catch (error: any) {
        setImportLog(`Erro Crítico na Importação: ${error.message}`);
        console.error(error);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        {currentUser && (
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">Logado como: {currentUser.name}</span>
        )}
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto gap-4">
        {['general', 'profile', 'team', 'registers', 'import', 'api'].map(tab => (
           <button 
             key={tab}
             onClick={() => setActiveTab(tab)}
             className={`pb-2 px-1 capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700'}`}
           >
             {tab === 'api' ? 'Integrações' : tab === 'import' ? 'Dados' : tab === 'registers' ? 'Cadastros' : tab === 'general' ? 'Geral' : tab === 'team' ? 'Equipe' : 'Perfil'}
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
                        <UserIcon size={40} />
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

        {activeTab === 'team' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Add User */}
              <div className="md:col-span-1 border-r border-slate-100 pr-0 md:pr-8">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Users size={20}/> Adicionar Membro</h3>
                <div className="space-y-3">
                  <input 
                    placeholder="Nome Completo" 
                    className="w-full border border-slate-300 p-2.5 rounded-lg text-sm"
                    value={newUser.name}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                  />
                  <input 
                    placeholder="Email (opcional)" 
                    className="w-full border border-slate-300 p-2.5 rounded-lg text-sm"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                  />
                  <select 
                    className="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white"
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                  >
                    <option value="Admin">Administrador</option>
                    <option value="Gerente">Gerente</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Vendedor">Vendedor</option>
                    <option value="Suporte">Suporte</option>
                  </select>
                  <button 
                    onClick={handleAddUser}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
                  >
                    Cadastrar
                  </button>
                  <p className="text-xs text-slate-500 mt-2">Limite: 5 funcionários adicionais.</p>
                </div>
              </div>

              {/* User List */}
              <div className="md:col-span-2">
                 <h3 className="text-lg font-bold text-slate-900 mb-4">Membros da Equipe ({team.length})</h3>
                 <div className="space-y-3">
                   {team.map(user => (
                     <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                       <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${user.role === 'Admin' ? 'bg-slate-800' : 'bg-blue-500'}`}>
                            {user.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{user.name} {user.id === currentUser?.id && '(Você)'}</p>
                            <p className="text-xs text-slate-500">{user.role}</p>
                          </div>
                       </div>
                       {user.role !== 'Admin' && (
                         <button onClick={() => handleDeleteUser(user.id)} className="text-rose-400 hover:text-rose-600 p-2">
                           <Trash2 size={16} />
                         </button>
                       )}
                       {user.role === 'Admin' && <span title="Admin Principal"><Shield size={16} className="text-slate-400 mr-2" /></span>}
                     </div>
                   ))}
                 </div>
              </div>
            </div>

            {/* Audit Logs */}
            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <History size={20} className="text-slate-500" /> Histórico de Atividades
              </h3>
              <div className="bg-slate-900 rounded-xl overflow-hidden shadow-inner">
                <div className="max-h-60 overflow-y-auto custom-scrollbar p-4 space-y-2">
                  {logs.map(log => (
                    <div key={log.id} className="text-xs font-mono flex gap-3 text-slate-300 border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                       <span className="text-slate-500 shrink-0 w-32">{new Date(log.timestamp).toLocaleString()}</span>
                       <span className={`font-bold shrink-0 w-24 ${log.action === 'delete' ? 'text-rose-400' : log.action === 'create' ? 'text-emerald-400' : 'text-blue-400'}`}>
                         [{log.action.toUpperCase()}]
                       </span>
                       <span className="text-slate-400 shrink-0 w-20 truncate" title={log.userName}>{log.userName}</span>
                       <span className="text-slate-200">{log.details}</span>
                    </div>
                  ))}
                  {logs.length === 0 && <div className="text-slate-600 text-center py-4">Nenhuma atividade registrada.</div>}
                </div>
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
               <label className="block text-sm font-bold text-slate-700 mb-1">Tipos de Serviço (Extraídos do PDF ou Manuais)</label>
               <textarea className="w-full border border-slate-300 p-3 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 outline-none" value={settings.serviceTypes.join(', ')} onChange={e => setSettings({...settings, serviceTypes: e.target.value.split(',').map(s=>s.trim())})} />
             </div>
             <div>
               <label className="block text-sm font-bold text-slate-700 mb-1">Categorias Financeiras</label>
               <textarea className="w-full border border-slate-300 p-3 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 outline-none" value={settings.categories.join(', ')} onChange={e => setSettings({...settings, categories: e.target.value.split(',').map(s=>s.trim())})} />
             </div>
           </div>
        )}

        {activeTab === 'import' && (
           <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {/* Clientes Card */}
               <div className="border border-slate-200 p-6 rounded-xl text-center hover:border-blue-300 transition-colors">
                 <h4 className="font-bold mb-2 text-slate-900">Clientes</h4>
                 <p className="text-sm text-slate-500 mb-4">Gerencie sua base de clientes.</p>
                 <div className="space-y-3">
                   <button onClick={() => handleExport('clients')} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2 w-full text-sm font-medium">
                     <Download size={16} /> Exportar CSV
                   </button>
                   <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2 w-full text-sm font-medium shadow-sm transition-all">
                     <Upload size={16} /> Importar CSV
                     <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImportCSV(e, 'clients')} />
                   </label>
                 </div>
               </div>

               {/* Financeiro Card */}
               <div className="border border-slate-200 p-6 rounded-xl text-center hover:border-blue-300 transition-colors">
                 <h4 className="font-bold mb-2 text-slate-900">Financeiro</h4>
                 <p className="text-sm text-slate-500 mb-4">Gerencie seu histórico financeiro.</p>
                 <div className="space-y-3">
                   <button onClick={() => handleExport('tx')} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2 w-full text-sm font-medium">
                     <Download size={16} /> Exportar CSV
                   </button>
                   <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2 w-full text-sm font-medium shadow-sm transition-all">
                     <Upload size={16} /> Importar CSV
                     <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImportCSV(e, 'tx')} />
                   </label>
                 </div>
               </div>
             </div>

             <div className="border-t border-slate-100 pt-6">
               <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                 <Sparkles className="text-purple-600" /> Migração Inteligente (AI)
               </h3>
               
               <div className="bg-purple-50 border border-purple-100 rounded-xl p-6">
                  <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="flex-1 space-y-4">
                      <div>
                        <h4 className="font-bold text-purple-900 mb-1">Importar do Sistema Antigo (PDF)</h4>
                        <p className="text-sm text-purple-700">
                          A I.A. fará uma leitura de <strong>Alta Precisão (JSON Bulk)</strong> para cadastrar clientes e transações. O sistema não usará ferramentas individuais para garantir que 100% dos dados sejam lidos.
                        </p>
                      </div>

                      <div className="bg-white/50 p-3 rounded-lg border border-purple-100">
                        <label className="block text-xs font-bold text-purple-800 mb-2 uppercase tracking-wide">Como interpretar valores?</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                           <button 
                             onClick={() => setImportTxType('auto')}
                             className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${importTxType === 'auto' ? 'bg-white border-purple-400 text-purple-800 shadow-sm' : 'border-transparent hover:bg-white/50 text-slate-600'}`}
                           >
                             <MousePointer2 size={14} /> Automático
                           </button>
                           <button 
                             onClick={() => setImportTxType('income')}
                             className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${importTxType === 'income' ? 'bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm' : 'border-transparent hover:bg-white/50 text-slate-600'}`}
                           >
                             <ArrowUpCircle size={14} /> Forçar Receitas
                           </button>
                           <button 
                             onClick={() => setImportTxType('expense')}
                             className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${importTxType === 'expense' ? 'bg-rose-100 border-rose-300 text-rose-800 shadow-sm' : 'border-transparent hover:bg-white/50 text-slate-600'}`}
                           >
                             <ArrowDownCircle size={14} /> Forçar Despesas
                           </button>
                        </div>
                      </div>
                      
                      <label className={`
                        flex items-center justify-center gap-2 w-full md:w-auto px-6 py-3 rounded-lg cursor-pointer transition-colors
                        ${isImporting ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'}
                      `}>
                         {isImporting ? <RefreshCw className="animate-spin" /> : <FileUp />}
                         {isImporting ? 'Processando...' : 'Selecionar Arquivo PDF'}
                         <input 
                           type="file" 
                           accept="application/pdf" 
                           className="hidden" 
                           disabled={isImporting}
                           onChange={handleLegacyPDFImport} 
                         />
                      </label>
                    </div>
                    
                    {importLog && (
                      <div className="flex-1 w-full">
                        <label className="text-xs font-bold text-purple-900 uppercase mb-1 block">Log de Importação</label>
                        <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-lg h-40 overflow-y-auto whitespace-pre-wrap">
                          {importLog}
                        </div>
                      </div>
                    )}
                  </div>
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
<pre>{`-- Execute no Supabase para atualizar o Schema de Equipe e Logs

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text,
  email text,
  role text,
  "avatarUrl" text,
  "createdAt" text
);

CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY,
  "userId" text,
  "userName" text,
  action text,
  target text,
  details text,
  timestamp text
);

-- Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON users;
CREATE POLICY "Public Access" ON users FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON logs;
CREATE POLICY "Public Access" ON logs FOR ALL USING (true) WITH CHECK (true);
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