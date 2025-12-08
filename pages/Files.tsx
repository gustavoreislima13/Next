import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { StoredFile, Client, Transaction } from '../types';
import { 
  File, FileText, Image as ImageIcon, Video, UploadCloud, Search, Trash2, 
  AlertTriangle, Edit2, Link, FileSpreadsheet, FileArchive, FileAudio, FileCode 
} from 'lucide-react';
import { useToast } from '../components/ToastContext';

export const Files: React.FC = () => {
  const { addToast } = useToast();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [search, setSearch] = useState('');
  
  // Edit State
  const [editingFile, setEditingFile] = useState<StoredFile | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', associatedClient: '', associatedTransactionId: '' });

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  const loadData = async () => {
    const [f, c, t] = await Promise.all([
      db.getFiles(),
      db.getClients(),
      db.getTransactions()
    ]);
    setFiles(f);
    setClients(c);
    setTransactions(t);
  };

  useEffect(() => {
    loadData();
    const subscription = db.subscribe('files', loadData);
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (fileList: FileList) => {
    // Simulation: We don't actually upload binary content to Supabase in this basic example
    // We just store metadata. In a real app, use supabase.storage.from('bucket').upload()
    const promises = Array.from(fileList).map(async (file) => {
      let type: StoredFile['type'] = 'other';
      if (file.type.includes('pdf')) type = 'pdf';
      else if (file.type.includes('image')) type = 'image';
      else if (file.type.includes('video')) type = 'video';

      const newFile: StoredFile = {
        id: crypto.randomUUID(),
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        date: new Date().toISOString(),
        type
      };
      await db.addFile(newFile);
    });
    
    try {
      await Promise.all(promises);
      addToast(`${fileList.length} arquivo(s) adicionado(s).`, 'success');
      loadData();
    } catch(e) {
      alert('Erro ao salvar arquivos.');
    }
  };

  const openEditModal = (file: StoredFile) => {
    setEditingFile(file);
    setEditFormData({ 
      name: file.name,
      associatedClient: file.associatedClient || '',
      associatedTransactionId: file.associatedTransactionId || ''
    });
  };

  const closeEditModal = () => {
    setEditingFile(null);
  };

  const handleUpdateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFile) return;

    try {
      const updatedFile: StoredFile = {
        ...editingFile,
        name: editFormData.name,
        associatedClient: editFormData.associatedClient || undefined,
        associatedTransactionId: editFormData.associatedTransactionId || undefined
      };
      await db.updateFile(updatedFile);
      addToast('Arquivo atualizado com sucesso.', 'success');
      loadData();
      closeEditModal();
    } catch (e: any) {
      alert('Erro ao atualizar arquivo: ' + e.message);
    }
  };

  const initiateDelete = (id: string) => {
    setDeleteConfirmation({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirmation.id) {
      try {
        await db.deleteFile(deleteConfirmation.id);
        addToast('Arquivo excluído.', 'info');
        setDeleteConfirmation({ isOpen: false, id: null });
        loadData();
      } catch (e) {
        alert('Erro ao excluir arquivo.');
      }
    }
  };

  const getIcon = (type: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';

    // Specific Type Checks first
    if (type === 'pdf' || ext === 'pdf') {
      return <FileText className="text-rose-500" size={32} />;
    }
    if (type === 'image' || ['jpg','jpeg','png','gif','webp','svg'].includes(ext)) {
      return <ImageIcon className="text-blue-500" size={32} />;
    }
    if (type === 'video' || ['mp4','mov','avi','mkv','webm'].includes(ext)) {
      return <Video className="text-purple-500" size={32} />;
    }

    // Extension based checks for 'other'
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
      return <FileSpreadsheet className="text-emerald-600" size={32} />;
    }
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) {
      return <FileText className="text-blue-600" size={32} />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <FileArchive className="text-amber-500" size={32} />;
    }
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
      return <FileAudio className="text-pink-500" size={32} />;
    }
    if (['js', 'ts', 'tsx', 'html', 'css', 'json', 'xml'].includes(ext)) {
      return <FileCode className="text-slate-600" size={32} />;
    }

    // Default
    return <File className="text-slate-400" size={32} />;
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-900">Arquivos</h1>

      {/* Upload Area */}
      <div 
        className={`
          border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <input 
          id="file-upload" 
          type="file" 
          multiple 
          className="hidden" 
          onChange={handleFileInput}
        />
        <UploadCloud className="mx-auto text-slate-400 mb-4" size={48} />
        <p className="text-lg font-medium text-slate-700">Arraste e solte arquivos aqui</p>
        <p className="text-sm text-slate-500 mt-1">ou clique para selecionar do computador</p>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
             <input 
              type="text"
              placeholder="Buscar arquivos..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
             />
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredFiles.map(file => {
             const associatedClientName = clients.find(c => c.id === file.associatedClient)?.name;
             const associatedTx = transactions.find(t => t.id === file.associatedTransactionId);
             
             return (
              <div key={file.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 gap-4">
                <div className="flex items-center gap-4">
                  {getIcon(file.type, file.name)}
                  <div>
                    <p className="text-sm font-medium text-slate-900">{file.name}</p>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2">
                      <span>{new Date(file.date).toLocaleDateString()} • {file.size}</span>
                      {(associatedClientName || associatedTx) && (
                        <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                          <Link size={10} />
                          {associatedClientName && <span>{associatedClientName}</span>}
                          {associatedClientName && associatedTx && <span>•</span>}
                          {associatedTx && <span>{associatedTx.description}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button className="text-slate-400 hover:text-blue-600 text-sm font-medium px-2">Download</button>
                  <button 
                    onClick={() => openEditModal(file)}
                    className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
                    title="Editar Informações"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => initiateDelete(file.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                    title="Excluir arquivo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredFiles.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">Nenhum arquivo encontrado.</div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">Editar Arquivo</h2>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-600">
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <form onSubmit={handleUpdateFile} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Arquivo</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editFormData.name}
                  onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vincular Cliente</label>
                <select 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editFormData.associatedClient}
                  onChange={e => setEditFormData({...editFormData, associatedClient: e.target.value})}
                >
                  <option value="">Nenhum</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vincular Transação</label>
                <select 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={editFormData.associatedTransactionId}
                  onChange={e => setEditFormData({...editFormData, associatedTransactionId: e.target.value})}
                >
                  <option value="">Nenhuma</option>
                  {transactions
                    .filter(t => !editFormData.associatedClient || t.clientId === editFormData.associatedClient)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {new Date(t.date).toLocaleDateString()} - {t.description} (R$ {t.amount})
                      </option>
                  ))}
                </select>
                {editFormData.associatedClient && (
                  <p className="text-xs text-slate-500 mt-1">Filtrando transações do cliente selecionado.</p>
                )}
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={closeEditModal} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Salvar Alterações</button>
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
              <h3 className="text-lg font-bold text-slate-900 mb-2">Excluir Arquivo</h3>
              <p className="text-sm text-slate-500 mb-6">
                Tem certeza que deseja excluir este arquivo? Esta ação não pode ser desfeita.
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