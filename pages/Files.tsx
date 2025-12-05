import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { StoredFile } from '../types';
import { FolderOpen, FileText, Image as ImageIcon, Video, UploadCloud, Search } from 'lucide-react';

export const Files: React.FC = () => {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [search, setSearch] = useState('');

  const loadFiles = async () => {
    const data = await db.getFiles();
    setFiles(data);
  };

  useEffect(() => {
    loadFiles();
    const subscription = db.subscribe('files', loadFiles);
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
      loadFiles();
    } catch(e) {
      alert('Erro ao salvar arquivos.');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="text-red-500" size={32} />;
      case 'image': return <ImageIcon className="text-blue-500" size={32} />;
      case 'video': return <Video className="text-purple-500" size={32} />;
      default: return <FolderOpen className="text-slate-400" size={32} />;
    }
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
          {filteredFiles.map(file => (
            <div key={file.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
              <div className="flex items-center gap-4">
                {getIcon(file.type)}
                <div>
                  <p className="text-sm font-medium text-slate-900">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(file.date).toLocaleDateString()} • {file.size}
                  </p>
                </div>
              </div>
              <button className="text-slate-400 hover:text-blue-600 text-sm font-medium">Download</button>
            </div>
          ))}
          {filteredFiles.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">Nenhum arquivo encontrado.</div>
          )}
        </div>
      </div>
    </div>
  );
};