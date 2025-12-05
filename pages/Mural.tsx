import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { StickyNote } from '../types';
import { Plus, X } from 'lucide-react';

const COLORS = ['bg-yellow-200', 'bg-blue-200', 'bg-green-200', 'bg-rose-200', 'bg-purple-200'];

export const Mural: React.FC = () => {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const loadNotes = async () => {
    const data = await db.getNotes();
    setNotes(data);
  };

  useEffect(() => {
    loadNotes();
    const subscription = db.subscribe('notes', loadNotes);
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const addNote = async () => {
    if (!newNoteTitle.trim()) return;
    const note: StickyNote = {
      id: crypto.randomUUID(),
      title: newNoteTitle,
      content: newNoteContent,
      color: selectedColor,
      x: 0, 
      y: 0
    };
    try {
      await db.saveNote(note);
      await loadNotes();
      setNewNoteTitle('');
      setNewNoteContent('');
      setIsAdding(false);
    } catch(e) {
      alert('Erro ao salvar nota.');
    }
  };

  const removeNote = async (id: string) => {
    try {
      await db.deleteNote(id);
      await loadNotes();
    } catch(e) {
      alert('Erro ao excluir nota.');
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mural de Avisos</h1>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
        >
          <Plus size={18} /> Novo Post-it
        </button>
      </div>

      {/* Input Area */}
      {isAdding && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 animate-fade-in">
          <input 
            type="text" 
            placeholder="Título..."
            className="w-full text-lg font-bold mb-2 outline-none border-b border-slate-100 pb-1"
            value={newNoteTitle}
            onChange={e => setNewNoteTitle(e.target.value)}
          />
          <textarea 
            placeholder="Escreva seu aviso..."
            className="w-full resize-none h-20 outline-none text-slate-600"
            value={newNoteContent}
            onChange={e => setNewNoteContent(e.target.value)}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button 
                  key={c}
                  className={`w-6 h-6 rounded-full ${c} ${selectedColor === c ? 'ring-2 ring-slate-400' : ''}`}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <button 
              onClick={addNote}
              className="bg-slate-900 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-slate-800"
            >
              Colar
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {notes.map(note => (
          <div 
            key={note.id} 
            className={`${note.color} p-6 rounded-sm shadow-md rotate-1 hover:rotate-0 transition-transform duration-300 relative group min-h-[200px] flex flex-col`}
          >
            <button 
              onClick={() => removeNote(note.id)}
              className="absolute top-2 right-2 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10 rounded p-1"
            >
              <X size={16} />
            </button>
            <h3 className="font-bold text-lg text-slate-800 mb-2 font-handwriting">{note.title}</h3>
            <p className="text-slate-700 whitespace-pre-wrap font-handwriting flex-1">{note.content}</p>
          </div>
        ))}
        {notes.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            Nenhum aviso no mural.
          </div>
        )}
      </div>
    </div>
  );
};