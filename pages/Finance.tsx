import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Transaction, Client, AppSettings, StoredFile } from '../types';
import { Plus, ArrowUpCircle, ArrowDownCircle, Trash2, RefreshCw, Search, FileText, UploadCloud, Paperclip, AlertTriangle } from 'lucide-react';
import { useToast } from '../components/ToastContext';

export const Finance: React.FC = () => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<AppSettings>(db.getLocalSettings());
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [isNewClientMode, setIsNewClientMode] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  // Forms
  const [formData, setFormData] = useState<Partial<Transaction>>({
    description: '', amount: 0, date: new Date().toISOString().split('T')[0],
    entity: '', category: '', observation: ''
  });
  const [newClientData, setNewClientData] = useState({ name: '', cpf: '', mobile: '', email: '' });

  useEffect(() => {
    refreshData();
    const sub1 = db.subscribe('transactions', refreshData);
    const sub2 = db.subscribe('clients', refreshData);
    return () => { sub1?.unsubscribe(); sub2?.unsubscribe(); };
  }, []);

  const refreshData = async () => {
    if (transactions.length === 0) setLoading(true);
    const [txs, cls, sett] = await Promise.all([db.getTransactions(), db.getClients(), db.getSettings()]);
    setTransactions(txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setClients(cls);
    setSettings(sett);
    // Initialize entity default
    if (!formData.entity && sett.entities.length > 0) {
      setFormData(prev => ({ ...prev, entity: sett.entities[0] }));
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount) return;

    // Validate new client
    if (txType === 'income' && isNewClientMode && !newClientData.name.trim()) {
      alert("Por favor, informe o nome do cliente.");
      return;
    }

    setLoading(true);
    try {
      const txId = crypto.randomUUID();
      let clientId = formData.clientId;

      // 1. Create New Client if needed
      if (txType === 'income' && isNewClientMode) {
        const nc: Client = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          name: newClientData.name,
          cpf: newClientData.cpf,
          mobile: newClientData.mobile,
          email: newClientData.email
        };
        await db.saveClient(nc);
        clientId = nc.id;
      }

      // 2. Upload Attachments (Simulated)
      const attachmentIds: string[] = [];
      if (attachedFiles.length > 0) {
        for (const f of attachedFiles) {
           const sf: StoredFile = {
             id: crypto.randomUUID(),
             name: f.name,
             size: (f.size / 1024 / 1024).toFixed(2) + ' MB',
             date: new Date().toISOString(),
             type: f.type.includes('pdf') ? 'pdf' : f.type.includes('image') ? 'image' : 'other',
             associatedClient: clientId,
             associatedTransactionId: txId
           };
           await db.addFile(sf);
           attachmentIds.push(sf.id);
        }
      }

      // 3. Save Transaction
      const tx: Transaction = {
        id: txId,
        type: txType,
        description: formData.description!,
        amount: Number(formData.amount),
        date: formData.date!,
        entity: formData.entity || settings.entities[0] || 'Geral',
        category: formData.category || 'Outros',
        observation: formData.observation,
        attachmentIds,
        clientId: txType === 'income' ? clientId : undefined,
        serviceType: txType === 'income' ? formData.serviceType : undefined,
        consultant: txType === 'income' ? formData.consultant : undefined,
        supplier: txType === 'expense' ? formData.supplier : undefined,
      };

      await db.saveTransaction(tx);
      addToast(`${txType === 'income' ? 'Receita' : 'Despesa'} salva com sucesso!`, 'success');
      await refreshData();
      resetForm();
    } catch (err: any) {
      console.error(err);
      // Show specific message if available (e.g., Missing Column)
      alert(err.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIsModalOpen(false);
    setIsNewClientMode(false);
    setAttachedFiles([]);
    setNewClientData({ name: '', cpf: '', mobile: '', email: '' });
    setFormData({
      description: '', amount: 0, date: new Date().toISOString().split('T')[0],
      entity: settings.entities[0] || '', category: '', observation: ''
    });
  };

  const initiateDelete = (id: string) => {
    setDeleteConfirmation({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirmation.id) {
      await db.deleteTransaction(deleteConfirmation.id);
      addToast('Transação excluída.', 'info');
      setDeleteConfirmation({ isOpen: false, id: null });
      refreshData();
    }
  };

  const filteredTxs = transactions.filter(t => {
    const s = searchTerm.toLowerCase();
    const matchesSearch = t.description.toLowerCase().includes(s) || 
                          (t.type === 'income' && clients.find(c => c.id === t.clientId)?.name.toLowerCase().includes(s));
    return matchesSearch && (filterType === 'all' || t.type === filterType) && (filterCategory === 'all' || t.category === filterCategory);
  });

  const balance = transactions.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
             Financeiro {loading && <RefreshCw size={18} className="animate-spin text-slate-400" />}
           </h1>
           <p className={`font-mono font-medium text-lg ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
             Saldo: R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
           </p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => { setTxType('expense'); setIsModalOpen(true); }} className="bg-rose-100 text-rose-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-200 flex items-center gap-2">
             <ArrowDownCircle size={18} /> Despesa
           </button>
           <button onClick={() => { setTxType('income'); setIsModalOpen(true); }} className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-200 flex items-center gap-2">
             <ArrowUpCircle size={18} /> Receita
           </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
         <div className="relative flex-1">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
           <input className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
         </div>
         <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" value={filterType} onChange={e => setFilterType(e.target.value)}>
           <option value="all">Todos Tipos</option>
           <option value="income">Receitas</option>
           <option value="expense">Despesas</option>
         </select>
         <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
           <option value="all">Todas Categorias</option>
           {settings.categories.map(c => <option key={c} value={c}>{c}</option>)}
         </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         <table className="w-full text-sm text-left">
           <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
             <tr>
               <th className="px-4 py-3">Data</th>
               <th className="px-4 py-3">Descrição</th>
               <th className="px-4 py-3">Entidade</th>
               <th className="px-4 py-3">Valor</th>
               <th className="px-4 py-3 text-right">Ações</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {filteredTxs.map(t => (
               <tr key={t.id} className="hover:bg-slate-50">
                 <td className="px-4 py-3 text-slate-600">{new Date(t.date).toLocaleDateString()}</td>
                 <td className="px-4 py-3">
                   <div className="font-medium text-slate-900 flex items-center gap-2">
                     {t.description}
                     {t.attachmentIds && t.attachmentIds.length > 0 && (
                       <div title={`${t.attachmentIds.length} anexo(s)`} className="bg-blue-50 p-1 rounded-md text-blue-600 border border-blue-100 flex items-center gap-1">
                         <Paperclip size={12} strokeWidth={2.5} />
                         <span className="text-[10px] font-bold leading-none">{t.attachmentIds.length}</span>
                       </div>
                     )}
                   </div>
                   <div className="text-xs text-slate-400">
                     {t.category} • {t.type === 'income' ? clients.find(c => c.id === t.clientId)?.name || 'Cliente N/D' : t.supplier}
                   </div>
                 </td>
                 <td className="px-4 py-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{t.entity}</span></td>
                 <td className={`px-4 py-3 font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                   {t.type === 'income' ? '+' : '-'} {t.amount.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                 </td>
                 <td className="px-4 py-3 text-right">
                   <button onClick={() => initiateDelete(t.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                 </td>
               </tr>
             ))}
             {filteredTxs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Sem registros.</td></tr>}
           </tbody>
         </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
             <div className={`p-4 border-b border-slate-100 flex justify-between items-center ${txType === 'income' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
               <h2 className={`font-bold ${txType === 'income' ? 'text-emerald-800' : 'text-rose-800'}`}>{txType === 'income' ? 'Nova Receita' : 'Nova Despesa'}</h2>
               <button onClick={resetForm} className="text-2xl leading-none opacity-50 hover:opacity-100">&times;</button>
             </div>
             
             <form onSubmit={handleSave} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="col-span-2">
                 <label className="text-sm font-medium text-slate-700">Descrição *</label>
                 <input required className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700">Valor (R$) *</label>
                 <input required type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} />
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700">Data *</label>
                 <input required type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
               </div>
               
               <div>
                 <label className="text-sm font-medium text-slate-700">Categoria</label>
                 <select className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                   <option value="">Selecione</option>
                   {settings.categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700">Entidade</label>
                 <select className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white" value={formData.entity} onChange={e => setFormData({...formData, entity: e.target.value})}>
                   {settings.entities.map(e => <option key={e} value={e}>{e}</option>)}
                 </select>
               </div>

               {txType === 'expense' && (
                 <div className="col-span-2">
                   <label className="text-sm font-medium text-slate-700">Fornecedor</label>
                   <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={formData.supplier || ''} onChange={e => setFormData({...formData, supplier: e.target.value})} />
                 </div>
               )}

               {txType === 'income' && (
                 <div className="col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                   <div className="flex justify-between items-center mb-2">
                     <label className="text-sm font-medium text-slate-700">Cliente</label>
                     <button type="button" onClick={() => setIsNewClientMode(!isNewClientMode)} className="text-xs font-bold text-blue-600 hover:underline">
                       {isNewClientMode ? 'Selecionar da Lista' : '+ Criar Novo'}
                     </button>
                   </div>
                   
                   {!isNewClientMode ? (
                     <select className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white" value={formData.clientId || ''} onChange={e => setFormData({...formData, clientId: e.target.value})}>
                       <option value="">Avulso / Nenhum</option>
                       {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                     </select>
                   ) : (
                     <div className="space-y-2 animate-fade-in">
                        <input placeholder="Nome Completo *" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newClientData.name} onChange={e => setNewClientData({...newClientData, name: e.target.value})} />
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="CPF" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newClientData.cpf} onChange={e => setNewClientData({...newClientData, cpf: e.target.value})} />
                          <input placeholder="Celular" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newClientData.mobile} onChange={e => setNewClientData({...newClientData, mobile: e.target.value})} />
                        </div>
                        <input placeholder="Email" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" value={newClientData.email} onChange={e => setNewClientData({...newClientData, email: e.target.value})} />
                     </div>
                   )}
                 </div>
               )}

               <div className="col-span-2">
                 <label className="text-sm font-medium text-slate-700">Observações</label>
                 <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 h-20 resize-none" value={formData.observation || ''} onChange={e => setFormData({...formData, observation: e.target.value})} />
               </div>

               <div className="col-span-2">
                  <label className="text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><Paperclip size={14}/> Anexos (Arquivos)</label>
                  <input type="file" multiple onChange={e => e.target.files && setAttachedFiles(Array.from(e.target.files))} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                  {attachedFiles.length > 0 && <p className="text-xs text-slate-500 mt-1">{attachedFiles.length} arquivos selecionados.</p>}
               </div>

               <div className="col-span-2 pt-4 flex justify-end gap-2 border-t border-slate-100">
                 <button type="button" onClick={resetForm} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">Cancelar</button>
                 <button type="submit" disabled={loading} className={`px-4 py-2 text-white rounded-lg text-sm font-medium shadow ${txType === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                    {loading ? 'Salvando...' : 'Confirmar'}
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="text-rose-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Excluir Transação</h3>
              <p className="text-sm text-slate-500 mb-6">
                Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita e pode afetar o saldo.
              </p>
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setDeleteConfirmation({isOpen: false, id: null})}
                  className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 text-white bg-rose-600 hover:bg-rose-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};