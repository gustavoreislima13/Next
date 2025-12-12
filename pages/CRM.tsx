import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Client, Transaction, StoredFile } from '../types';
import { Search, Plus, Trash2, Edit2, Phone, Mail, Calendar, RefreshCw, AlertTriangle, FileText, Wallet, ClipboardList, ExternalLink, ArrowUpRight, FolderOpen, Save, X } from 'lucide-react';
import { useToast } from '../components/ToastContext';

type Tab = 'details' | 'triage' | 'financial' | 'files';

export const CRM: React.FC = () => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  
  // Selection & Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Associated Data
  const [clientTransactions, setClientTransactions] = useState<Transaction[]>([]);
  const [clientFiles, setClientFiles] = useState<StoredFile[]>([]);

  // Triage Schedule State
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  // Form State
  const [formData, setFormData] = useState<Partial<Client>>({
    name: '', cpf: '', mobile: '', email: '', status: 'Lead', triageNotes: ''
  });

  useEffect(() => {
    refreshClients();
    const subscription = db.subscribe('clients', refreshClients);
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const refreshClients = async () => {
    if (clients.length === 0) setLoading(true);
    const data = await db.getClients();
    setClients(data);
    setLoading(false);
  };

  const loadAssociatedData = async (clientId: string) => {
    const [txs, files] = await Promise.all([db.getTransactions(), db.getFiles()]);
    setClientTransactions(txs.filter(t => t.clientId === clientId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setClientFiles(files.filter(f => f.associatedClient === clientId));
  };

  const openModal = async (client?: Client) => {
    setActiveTab('details'); // Reset to first tab
    if (client) {
      setEditingClient(client);
      setFormData({ 
        name: client.name, 
        cpf: client.cpf, 
        mobile: client.mobile, 
        email: client.email,
        status: client.status || 'Lead',
        triageNotes: client.triageNotes || ''
      });
      await loadAssociatedData(client.id);
    } else {
      setEditingClient(null);
      setClientTransactions([]);
      setClientFiles([]);
      setFormData({ name: '', cpf: '', mobile: '', email: '', status: 'Lead', triageNotes: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const newClient: Client = {
      id: editingClient ? editingClient.id : crypto.randomUUID(),
      createdAt: editingClient ? editingClient.createdAt : new Date().toISOString(),
      name: formData.name,
      cpf: formData.cpf || '',
      mobile: formData.mobile || '',
      email: formData.email || '',
      status: formData.status as any || 'Lead',
      triageNotes: formData.triageNotes || ''
    };

    try {
      await db.saveClient(newClient);
      addToast('Cliente salvo com sucesso!', 'success');
      refreshClients();
      // Don't close immediately if editing, just notify
      if (editingClient) {
          setEditingClient(newClient); 
      } else {
          closeModal();
      }
    } catch (error) {
      addToast('Erro ao salvar cliente.', 'error');
    }
  };

  const initiateDelete = (id: string) => {
    setDeleteConfirmation({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirmation.id) {
      await db.deleteClient(deleteConfirmation.id);
      addToast('Cliente excluído.', 'info');
      setDeleteConfirmation({ isOpen: false, id: null });
      refreshClients();
    }
  };

  const openGoogleCalendar = () => {
    if (!formData.name) return;
    
    // Construct Google Calendar Link
    const title = encodeURIComponent(`Reunião com ${formData.name}`);
    const details = encodeURIComponent(`Cliente: ${formData.name}\nContato: ${formData.mobile}\nNota de Triagem: ${formData.triageNotes}`);
    const emails = formData.email ? `&add=${formData.email}` : '';
    
    let dates = '';
    if (scheduleDate) {
        // Format YYYYMMDDTHHMMSSZ
        const start = new Date(`${scheduleDate}T${scheduleTime || '09:00'}:00`);
        const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration
        
        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        dates = `&dates=${fmt(start)}/${fmt(end)}`;
    }

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${emails}${dates}`;
    window.open(url, '_blank');
  };

  const filteredClients = clients.filter(c => {
    const s = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) || 
      c.cpf.includes(s) ||
      c.email.toLowerCase().includes(s) ||
      c.mobile.includes(s)
    );
  });

  const getStatusColor = (status?: string) => {
    switch(status) {
      case 'Fechado': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Em Negociação': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Perdido': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
           <h1 className="text-2xl font-bold text-slate-900 dark:text-white">CRM & Clientes</h1>
           {loading && <RefreshCw size={18} className="animate-spin text-slate-400" />}
        </div>
        
        <button 
          onClick={() => openModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-md shadow-blue-200 dark:shadow-blue-900/20"
        >
          <Plus size={18} /> Novo Cliente
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nome, CPF, email ou telefone..." 
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredClients.map((client) => (
          <div key={client.id} onClick={() => openModal(client)} className="group bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer relative">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-100 dark:border-blue-800">
                  {client.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{client.name}</h3>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${getStatusColor(client.status)}`}>
                    {client.status || 'Lead'}
                  </span>
                </div>
              </div>
              
              <button onClick={(e) => { e.stopPropagation(); initiateDelete(client.id); }} className="p-2 text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors">
                  <Trash2 size={16} />
              </button>
            </div>
            
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-50 dark:border-slate-800 pt-4">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-slate-400" />
                <span className="truncate">{client.email || 'Sem e-mail'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-slate-400" />
                {client.mobile || 'Sem celular'}
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                Cadastrado em {new Date(client.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}

        {!loading && filteredClients.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500 dark:text-slate-400">
            Nenhum cliente encontrado.
          </div>
        )}
      </div>

      {/* Main Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-6 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-fade-in border border-slate-200 dark:border-slate-800">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30">
                    {formData.name ? formData.name.substring(0, 2).toUpperCase() : <Plus />}
                 </div>
                 <div>
                   <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                     {editingClient ? formData.name : 'Novo Cliente'}
                   </h2>
                   <p className="text-sm text-slate-500 dark:text-slate-400">
                     {editingClient ? 'Gerencie dados, triagem e histórico.' : 'Preencha os dados iniciais.'}
                   </p>
                 </div>
               </div>
               <button onClick={closeModal} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                 <X size={24} className="text-slate-500" />
               </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 bg-white dark:bg-slate-900">
               {[
                 { id: 'details', label: 'Dados Cadastrais', icon: FileText },
                 { id: 'triage', label: 'Triagem & Agenda', icon: ClipboardList },
                 { id: 'financial', label: 'Financeiro', icon: Wallet },
                 { id: 'files', label: 'Arquivos', icon: FolderOpen },
               ].map((tab) => (
                 <button
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id as Tab)}
                   disabled={!editingClient && tab.id !== 'details'}
                   className={`
                     flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors
                     ${activeTab === tab.id 
                       ? 'border-blue-600 text-blue-600 dark:text-blue-400' 
                       : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}
                     ${!editingClient && tab.id !== 'details' ? 'opacity-50 cursor-not-allowed' : ''}
                   `}
                 >
                   <tab.icon size={16} />
                   {tab.label}
                 </button>
               ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-black/20">
              
              {/* Tab: Details */}
              {activeTab === 'details' && (
                <form onSubmit={handleSave} className="space-y-6 max-w-2xl mx-auto">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="col-span-2">
                       <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Nome Completo</label>
                       <input required type="text" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                         value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                     </div>
                     <div>
                       <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">CPF / CNPJ</label>
                       <input type="text" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                         value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} />
                     </div>
                     <div>
                       <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Celular / WhatsApp</label>
                       <input type="text" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                         value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
                     </div>
                     <div className="col-span-2">
                       <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">E-mail</label>
                       <input type="email" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                         value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                     </div>
                   </div>
                   <div className="flex justify-end pt-4">
                     <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2">
                       <Save size={18} /> Salvar Dados
                     </button>
                   </div>
                </form>
              )}

              {/* Tab: Triage */}
              {activeTab === 'triage' && (
                <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-6">
                     <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Status do Cliente</label>
                        <div className="grid grid-cols-2 gap-2">
                          {['Lead', 'Em Negociação', 'Fechado', 'Perdido'].map(s => (
                             <button 
                               key={s}
                               onClick={() => setFormData({...formData, status: s as any})}
                               className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${formData.status === s ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                             >
                               {s}
                             </button>
                          ))}
                        </div>
                     </div>

                     <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Notas de Triagem / Histórico</label>
                        <textarea 
                           className="w-full h-40 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                           placeholder="Registre aqui detalhes da negociação, interesses ou observações importantes..."
                           value={formData.triageNotes}
                           onChange={e => setFormData({...formData, triageNotes: e.target.value})}
                        />
                     </div>
                   </div>

                   <div className="space-y-6">
                      <div className="bg-gradient-to-br from-blue-50 to-white dark:from-slate-800 dark:to-slate-900 p-6 rounded-xl border border-blue-100 dark:border-slate-700 shadow-sm">
                         <div className="flex items-center gap-2 mb-4 text-blue-700 dark:text-blue-400 font-bold">
                           <Calendar size={20} />
                           <h3>Agendar Reunião</h3>
                         </div>
                         <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                           Selecione data e hora para criar um evento no Google Calendar com os dados deste cliente.
                         </p>
                         <div className="space-y-3 mb-4">
                           <input type="date" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                           <input type="time" className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                         </div>
                         <button 
                           onClick={openGoogleCalendar}
                           className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-sm"
                         >
                           <ExternalLink size={16} /> Abrir Google Calendar
                         </button>
                      </div>
                      
                      <div className="flex justify-end">
                         <button onClick={handleSave} className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg">
                           <Save size={18} /> Salvar Triagem
                         </button>
                      </div>
                   </div>
                </div>
              )}

              {/* Tab: Financial */}
              {activeTab === 'financial' && (
                <div className="space-y-4">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800">
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase">Total Receitas</span>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          R$ {clientTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </p>
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-lg border border-rose-100 dark:border-rose-800">
                        <span className="text-xs font-bold text-rose-800 dark:text-rose-300 uppercase">Total Despesas</span>
                        <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                          R$ {clientTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                         <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase">Nº Transações</span>
                         <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{clientTransactions.length}</p>
                      </div>
                   </div>

                   <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-700">
                          <tr>
                            <th className="px-4 py-3">Data</th>
                            <th className="px-4 py-3">Descrição</th>
                            <th className="px-4 py-3">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {clientTransactions.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(t.date).toLocaleDateString()}</td>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{t.description}</td>
                              <td className={`px-4 py-3 font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                              </td>
                            </tr>
                          ))}
                          {clientTransactions.length === 0 && (
                            <tr><td colSpan={3} className="p-6 text-center text-slate-400">Nenhuma transação vinculada.</td></tr>
                          )}
                        </tbody>
                      </table>
                   </div>
                </div>
              )}

              {/* Tab: Files */}
              {activeTab === 'files' && (
                <div>
                   <div className="grid grid-cols-1 gap-3">
                     {clientFiles.map(file => (
                       <div key={file.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-md transition-shadow">
                          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400">
                             {file.type === 'pdf' ? <FileText /> : <FolderOpen />}
                          </div>
                          <div className="flex-1">
                             <h4 className="font-bold text-slate-900 dark:text-white">{file.name}</h4>
                             <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(file.date).toLocaleDateString()} • {file.size}</p>
                          </div>
                          <button className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">Download</button>
                       </div>
                     ))}
                     {clientFiles.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                           <FolderOpen size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                           <p className="text-slate-500 dark:text-slate-400">Nenhum arquivo vinculado a este cliente.</p>
                           <p className="text-xs text-slate-400 mt-1">Vá em "Arquivos" para fazer upload e vincular.</p>
                        </div>
                     )}
                   </div>
                </div>
              )}

            </div>
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
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Excluir Cliente</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
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