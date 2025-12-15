import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { Transaction, Client, AppSettings, StoredFile } from '../types';
import { Plus, ArrowUpCircle, ArrowDownCircle, Trash2, RefreshCw, Search, FileText, UploadCloud, Paperclip, AlertTriangle, Edit2, Check, X, ChevronDown, Calendar, Wallet } from 'lucide-react';
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
  const [filterClient, setFilterClient] = useState('all'); 
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  // Filter Autocomplete State
  const [filterClientSearch, setFilterClientSearch] = useState('');
  const [showFilterClientDropdown, setShowFilterClientDropdown] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [isNewClientMode, setIsNewClientMode] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // Modal Client Autocomplete State
  const [formClientSearch, setFormClientSearch] = useState('');
  const [showFormClientDropdown, setShowFormClientDropdown] = useState(false);

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  // Forms
  const [formData, setFormData] = useState<Partial<Transaction>>({
    description: '', amount: 0, date: new Date().toISOString().split('T')[0],
    entity: '', category: '', observation: '', account: ''
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
    const [txs, cls, sett] = await Promise.all([
      db.getTransactions(), 
      db.getClients(1, 1000), // Fetch up to 1000 clients for lookups
      db.getSettings()
    ]);
    setTransactions(txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setClients(cls.data);
    setSettings(sett);
    // Initialize defaults
    setFormData(prev => ({ 
      ...prev, 
      entity: prev.entity || sett.entities[0] || '',
      account: prev.account || sett.banks[0] || ''
    }));
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount) return;

    // Validate new client
    if (txType === 'income') {
      if (isNewClientMode && !newClientData.name.trim()) {
        addToast("Por favor, informe o nome do cliente.", "info");
        return;
      }
    }

    setLoading(true);
    try {
      // Use existing ID if editing, otherwise generate new
      const txId = editingId || crypto.randomUUID();
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
      const newAttachmentIds: string[] = [];
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
           newAttachmentIds.push(sf.id);
        }
      }

      // Preserve existing attachments if editing
      let finalAttachmentIds = newAttachmentIds;
      if (editingId) {
        const existingTx = transactions.find(t => t.id === editingId);
        if (existingTx && existingTx.attachmentIds) {
          finalAttachmentIds = [...existingTx.attachmentIds, ...newAttachmentIds];
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
        account: formData.account, // New field
        observation: formData.observation,
        attachmentIds: finalAttachmentIds,
        clientId: txType === 'income' ? clientId : undefined,
        serviceType: txType === 'income' ? formData.serviceType : undefined,
        consultant: txType === 'income' ? formData.consultant : undefined,
        supplier: txType === 'expense' ? formData.supplier : undefined,
      };

      await db.saveTransaction(tx);
      addToast(`${txType === 'income' ? 'Receita' : 'Despesa'} ${editingId ? 'atualizada' : 'salva'} com sucesso!`, 'success');
      await refreshData();
      resetForm();
    } catch (err: any) {
      console.error(err);
      addToast(err.message || "Erro ao salvar transação.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const initiateEdit = (t: Transaction) => {
    setEditingId(t.id);
    setTxType(t.type);
    
    // Find client name for autocomplete
    const clientName = clients.find(c => c.id === t.clientId)?.name || '';
    setFormClientSearch(clientName);

    setFormData({
      description: t.description,
      amount: t.amount,
      date: t.date,
      entity: t.entity,
      category: t.category,
      account: t.account,
      observation: t.observation || '',
      clientId: t.clientId,
      serviceType: t.serviceType,
      consultant: t.consultant,
      supplier: t.supplier
    });
    setIsNewClientMode(false); 
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setIsNewClientMode(false);
    setAttachedFiles([]);
    setFormClientSearch('');
    setNewClientData({ name: '', cpf: '', mobile: '', email: '' });
    setFormData({
      description: '', amount: 0, date: new Date().toISOString().split('T')[0],
      entity: settings.entities[0] || '', category: '', account: settings.banks[0] || '', observation: ''
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
                          (t.type === 'income' && clients.find(c => c.id === t.clientId)?.name.toLowerCase().includes(s)) ||
                          (t.account?.toLowerCase().includes(s));
    
    // Check all filters
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
    const matchesClient = filterClient === 'all' || t.clientId === filterClient;
    
    // Check Date Range
    const matchesStartDate = !filterStartDate || t.date >= filterStartDate;
    const matchesEndDate = !filterEndDate || t.date <= filterEndDate;

    return matchesSearch && matchesType && matchesCategory && matchesClient && matchesStartDate && matchesEndDate;
  });

  const balance = filteredTxs.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);

  // Helper for filter clients
  const filteredClientsForSearch = (query: string) => {
    return clients.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Financeiro {loading && <RefreshCw size={18} className="animate-spin text-slate-400" />}
           </h1>
           <p className={`font-mono font-medium text-lg ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
             Saldo (Filtrado): R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
           </p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => { setTxType('expense'); setIsModalOpen(true); }} className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-200 dark:hover:bg-rose-900/50 flex items-center gap-2">
             <ArrowDownCircle size={18} /> Despesa
           </button>
           <button onClick={() => { setTxType('income'); setIsModalOpen(true); }} className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 flex items-center gap-2">
             <ArrowUpCircle size={18} /> Receita
           </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col xl:flex-row gap-3">
         <div className="relative flex-1 min-w-[200px]">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
           <input className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:border-blue-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" placeholder="Buscar descrição..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
         </div>
         
         <div className="flex gap-2 flex-wrap">
           <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2">
              <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Data:</span>
              <input 
                type="date" 
                className="py-2 bg-transparent text-sm text-slate-900 dark:text-white outline-none w-28 lg:w-auto"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                title="Data Inicial"
              />
              <span className="text-slate-400">-</span>
              <input 
                type="date" 
                className="py-2 bg-transparent text-sm text-slate-900 dark:text-white outline-none w-28 lg:w-auto"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                title="Data Final"
              />
              {(filterStartDate || filterEndDate) && (
                <button onClick={() => {setFilterStartDate(''); setFilterEndDate('')}} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>
              )}
           </div>

           <select className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none" value={filterType} onChange={e => setFilterType(e.target.value)}>
             <option value="all">Todos Tipos</option>
             <option value="income">Receitas</option>
             <option value="expense">Despesas</option>
           </select>
           
           <select className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none max-w-[150px]" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
             <option value="all">Todas Categorias</option>
             {settings.categories.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
           
           {/* Filter Client Autocomplete */}
           <div className="relative min-w-[200px] flex-1 xl:flex-none">
              <div className="relative">
                <input 
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-blue-500 outline-none pr-8"
                  placeholder="Filtrar Cliente..."
                  value={filterClientSearch}
                  onFocus={() => setShowFilterClientDropdown(true)}
                  onChange={(e) => {
                    setFilterClientSearch(e.target.value);
                    if(e.target.value === '') setFilterClient('all');
                    setShowFilterClientDropdown(true);
                  }}
                />
                {filterClient !== 'all' ? (
                   <button 
                    onClick={() => { setFilterClient('all'); setFilterClientSearch(''); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                   >
                     <X size={14} />
                   </button>
                ) : (
                   <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                )}
              </div>
              
              {showFilterClientDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowFilterClientDropdown(false)} />
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar right-0 min-w-[200px]">
                    <button 
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-100 dark:border-slate-800"
                      onClick={() => {
                        setFilterClient('all');
                        setFilterClientSearch('');
                        setShowFilterClientDropdown(false);
                      }}
                    >
                      Todos os Clientes
                    </button>
                    {filteredClientsForSearch(filterClientSearch).map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex justify-between items-center"
                        onClick={() => {
                          setFilterClient(c.id);
                          setFilterClientSearch(c.name);
                          setShowFilterClientDropdown(false);
                        }}
                      >
                        {c.name}
                        {filterClient === c.id && <Check size={14} className="text-blue-500" />}
                      </button>
                    ))}
                    {filteredClientsForSearch(filterClientSearch).length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-400">Nenhum cliente encontrado</div>
                    )}
                  </div>
                </>
              )}
           </div>
         </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
         <table className="w-full text-sm text-left">
           <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-700">
             <tr>
               <th className="px-4 py-3">Data</th>
               <th className="px-4 py-3">Descrição</th>
               <th className="px-4 py-3">Entidade</th>
               <th className="px-4 py-3">Valor</th>
               <th className="px-4 py-3 text-right">Ações</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
             {filteredTxs.map(t => (
               <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                 <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                 <td className="px-4 py-3">
                   <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                     {t.description}
                     {t.attachmentIds && t.attachmentIds.length > 0 && (
                       <div title={`${t.attachmentIds.length} anexo(s)`} className="bg-blue-50 dark:bg-blue-900/30 p-1 rounded-md text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 flex items-center gap-1">
                         <Paperclip size={12} strokeWidth={2.5} />
                         <span className="text-[10px] font-bold leading-none">{t.attachmentIds.length}</span>
                       </div>
                     )}
                   </div>
                   <div className="text-xs text-slate-400 dark:text-slate-500">
                     {t.category} • {t.type === 'income' ? clients.find(c => c.id === t.clientId)?.name || 'Cliente N/D' : t.supplier}
                     {t.account && <span className="ml-2 text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-1.5 rounded">@{t.account}</span>}
                   </div>
                 </td>
                 <td className="px-4 py-3"><span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{t.entity}</span></td>
                 <td className={`px-4 py-3 font-bold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                   {t.type === 'income' ? '+' : '-'} {t.amount.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                 </td>
                 <td className="px-4 py-3 text-right">
                   <div className="flex justify-end gap-2">
                     <button onClick={() => initiateEdit(t)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="Editar">
                       <Edit2 size={16} />
                     </button>
                     <button onClick={() => initiateDelete(t.id)} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="Excluir">
                       <Trash2 size={16} />
                     </button>
                   </div>
                 </td>
               </tr>
             ))}
             {filteredTxs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400 dark:text-slate-500">Sem registros.</td></tr>}
           </tbody>
         </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in border border-slate-200 dark:border-slate-800">
             <div className={`p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center ${txType === 'income' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
               <h2 className={`font-bold ${txType === 'income' ? 'text-emerald-800 dark:text-emerald-400' : 'text-rose-800 dark:text-rose-400'}`}>
                 {editingId ? 'Editar' : 'Nova'} {txType === 'income' ? 'Receita' : 'Despesa'}
               </h2>
               <button onClick={resetForm} className="text-2xl leading-none opacity-50 hover:opacity-100 dark:text-slate-300">&times;</button>
             </div>
             
             <form onSubmit={handleSave} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="col-span-2">
                 <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descrição *</label>
                 <input required className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Valor (R$) *</label>
                 <input required type="number" step="0.01" className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} />
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Data *</label>
                 <input required type="date" className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
               </div>
               
               <div>
                 <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Conta / Canal</label>
                 <select className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.account} onChange={e => setFormData({...formData, account: e.target.value})}>
                   <option value="">Selecione</option>
                   {settings.banks.map(b => <option key={b} value={b}>{b}</option>)}
                 </select>
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Categoria</label>
                 <select className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                   <option value="">Selecione</option>
                   {settings.categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Entidade</label>
                 <select className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.entity} onChange={e => setFormData({...formData, entity: e.target.value})}>
                   {settings.entities.map(e => <option key={e} value={e}>{e}</option>)}
                 </select>
               </div>

               {txType === 'expense' && (
                 <div className="col-span-2">
                   <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fornecedor</label>
                   <input className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.supplier || ''} onChange={e => setFormData({...formData, supplier: e.target.value})} />
                 </div>
               )}

               {txType === 'income' && (
                 <div className="col-span-2 bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                   <div className="flex justify-between items-center mb-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Cliente</label>
                     {!editingId && (
                       <button type="button" onClick={() => setIsNewClientMode(!isNewClientMode)} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                         {isNewClientMode ? 'Selecionar da Lista' : '+ Criar Novo'}
                       </button>
                     )}
                   </div>
                   
                   {!isNewClientMode ? (
                     <div className="relative">
                        <input 
                           className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                           placeholder="Digite para buscar..."
                           value={formClientSearch}
                           onFocus={() => setShowFormClientDropdown(true)}
                           onChange={(e) => {
                             setFormClientSearch(e.target.value);
                             setShowFormClientDropdown(true);
                             // Clear ID if typed changed so user must re-select to be valid
                             if (formData.clientId) setFormData({...formData, clientId: ''});
                           }}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {formData.clientId ? <Check size={16} className="text-emerald-500" /> : <Search size={16} className="text-slate-400" />}
                        </div>
                        
                        {showFormClientDropdown && (
                          <>
                             <div className="fixed inset-0 z-10" onClick={() => setShowFormClientDropdown(false)} />
                             <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                                {filteredClientsForSearch(formClientSearch).map(c => (
                                  <button
                                    type="button"
                                    key={c.id}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 border-b border-slate-50 dark:border-slate-800 last:border-0"
                                    onClick={() => {
                                      setFormData({...formData, clientId: c.id});
                                      setFormClientSearch(c.name);
                                      setShowFormClientDropdown(false);
                                    }}
                                  >
                                    {c.name}
                                  </button>
                                ))}
                                {filteredClientsForSearch(formClientSearch).length === 0 && (
                                  <div className="px-3 py-2 text-sm text-slate-400">Nenhum cliente encontrado.</div>
                                )}
                             </div>
                          </>
                        )}
                     </div>
                   ) : (
                     <div className="space-y-2 animate-fade-in">
                        <input placeholder="Nome Completo *" className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" value={newClientData.name} onChange={e => setNewClientData({...newClientData, name: e.target.value})} />
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="CPF" className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" value={newClientData.cpf} onChange={e => setNewClientData({...newClientData, cpf: e.target.value})} />
                          <input placeholder="Celular" className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" value={newClientData.mobile} onChange={e => setNewClientData({...newClientData, mobile: e.target.value})} />
                        </div>
                        <input placeholder="Email" className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white" value={newClientData.email} onChange={e => setNewClientData({...newClientData, email: e.target.value})} />
                     </div>
                   )}
                 </div>
               )}

               <div className="col-span-2">
                 <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Observações</label>
                 <textarea className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 h-20 resize-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={formData.observation || ''} onChange={e => setFormData({...formData, observation: e.target.value})} />
               </div>

               <div className="col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2"><Paperclip size={14}/> Anexos (Arquivos)</label>
                  <input type="file" multiple onChange={e => e.target.files && setAttachedFiles(Array.from(e.target.files))} className="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/50 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/70"/>
                  {attachedFiles.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{attachedFiles.length} arquivos selecionados.</p>}
                  {editingId && formData.attachmentIds && formData.attachmentIds.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                      + {formData.attachmentIds.length} anexo(s) já existente(s).
                    </p>
                  )}
               </div>

               <div className="col-span-2 pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                 <button type="button" onClick={resetForm} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm">Cancelar</button>
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
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="text-rose-600 dark:text-rose-400" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Excluir Transação</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita e pode afetar o saldo.
              </p>
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setDeleteConfirmation({isOpen: false, id: null})}
                  className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
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