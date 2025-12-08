import React, { useState, useRef, useEffect } from 'react';
import { generateBusinessInsight, AIMode } from '../services/geminiService';
import { db } from '../services/db';
import { StoredFile } from '../types';
import { Send, Bot, RefreshCw, Key, ArrowRight, Mic, Image as ImageIcon, X, Zap, Brain, Sparkles, StopCircle, Radio, MessageCircle, Paperclip, FileText } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export const AI: React.FC = () => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Olá! Sou a I.A. Nexus. Tenho acesso completo ao banco de dados. \n\nVocê pode me perguntar coisas como: \n- "Quanto faturamos este mês?" \n- "Analise este arquivo PDF" \n- "Adicione uma despesa de R$ 50 para Café".' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  
  // Controls
  const [aiMode, setAiMode] = useState<AIMode>('standard');
  const [selectedImage, setSelectedImage] = useState<{data: string, mimeType: string} | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check key presence
    const s = db.getLocalSettings();
    let envKey = '';
    try { if (process.env) envKey = process.env.API_KEY || ''; } catch {}
    setApiKeyMissing(!s.geminiApiKey && !envKey);
    
    // Auto scroll
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if ((!textToSend.trim() && !selectedImage && !selectedFile) || isLoading) return;

    setInput('');
    const imgToSend = selectedImage;
    const fileToSend = selectedFile;
    
    setSelectedImage(null);
    setSelectedFile(null);
    setIsLoading(true);

    // Optimistic UI
    const parts = [];
    if (fileToSend) parts.push(`[Arquivo: ${fileToSend.name}]`);
    if (imgToSend) parts.push('[Imagem Anexada]');
    if (textToSend) parts.push(textToSend);
    setMessages(prev => [...prev, { role: 'user', text: parts.join(' ') }]);

    try {
      let documentData: string | undefined = undefined;
      let documentMime: string | undefined = undefined;

      // If generic file is selected, process it
      if (fileToSend) {
        // 1. Save to Files Database (Persistent Storage)
        const storedFile: StoredFile = {
            id: crypto.randomUUID(),
            name: fileToSend.name,
            size: (fileToSend.size / 1024 / 1024).toFixed(2) + ' MB',
            date: new Date().toISOString(),
            type: fileToSend.type.includes('pdf') ? 'pdf' : fileToSend.type.includes('image') ? 'image' : 'other'
        };
        await db.addFile(storedFile);

        // 2. Read for AI (Context Analysis)
        const reader = new FileReader();
        documentData = await new Promise<string>((resolve) => {
            reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
            reader.readAsDataURL(fileToSend);
        });
        documentMime = fileToSend.type;
      }

      const response = await generateBusinessInsight({
        prompt: textToSend || (fileToSend ? "Analise este arquivo que acabei de enviar e salvei no sistema." : ""),
        image: imgToSend?.data,
        document: documentData,
        mimeType: imgToSend?.mimeType || documentMime,
        mode: aiMode
      });
      setMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'ai', text: "Erro ao processar solicitação: " + e.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Image Helper
  const onSelectImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSelectedImage({
          data: (ev.target?.result as string).split(',')[1],
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Generic File Helper
  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
       setSelectedFile(e.target.files[0]);
    }
  };

  // Audio Helper
  const toggleRecording = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          // Auto send audio
          setMessages(prev => [...prev, { role: 'user', text: "🎤 [Áudio Enviado]" }]);
          setIsLoading(true);
          try {
            const res = await generateBusinessInsight({
              prompt: '',
              audio: base64,
              mimeType: 'audio/webm',
              mode: 'standard'
            });
            setMessages(prev => [...prev, { role: 'ai', text: res }]);
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (e) {
      alert("Microfone não disponível.");
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Nexus AI</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${apiKeyMissing ? 'bg-red-500' : 'bg-emerald-500'}`} />
              {apiKeyMissing ? 'Sem Chave de API' : 'Conectado ao Banco de Dados'}
            </div>
          </div>
        </div>
        
        {/* Modes */}
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button 
            onClick={() => setAiMode('fast')}
            title="Rápido (Flash Lite)"
            className={`p-1.5 rounded-md transition-all ${aiMode === 'fast' ? 'bg-white shadow text-yellow-600' : 'text-slate-500'}`}
          >
            <Zap size={16} />
          </button>
          <button 
            onClick={() => setAiMode('standard')}
            title="Padrão (Flash)"
            className={`p-1.5 rounded-md transition-all ${aiMode === 'standard' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
          >
            <Sparkles size={16} />
          </button>
          <button 
            onClick={() => setAiMode('thinking')}
            title="Raciocínio (Pro Thinking)"
            className={`p-1.5 rounded-md transition-all ${aiMode === 'thinking' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}
          >
            <Brain size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50" ref={scrollRef}>
        {apiKeyMissing && (
           <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-3 text-amber-900 text-sm">
             <Key className="shrink-0" />
             <div>
               Configure sua chave API em <NavLink to="/config" className="underline font-bold">Configurações</NavLink>.
             </div>
           </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`
              max-w-[85%] rounded-2xl p-4 text-sm shadow-sm relative
              ${m.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white border border-slate-200 rounded-bl-none text-slate-700'}
            `}>
              <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>') }} />
              {m.role === 'ai' && <div className="absolute -bottom-5 left-0 text-[10px] text-slate-400">Nexus AI</div>}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-3 text-sm text-slate-600">
               <RefreshCw size={16} className="animate-spin text-blue-600" />
               {aiMode === 'thinking' ? 'Analisando dados e arquivos...' : 'Processando...'}
             </div>
          </div>
        )}
      </div>

      {/* Quick Suggestions & Input */}
      <div className="bg-white border-t border-slate-100">
        {/* Quick Chips */}
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={() => handleSend("Resumo financeiro deste mês")} className="whitespace-nowrap px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100 hover:bg-blue-100 transition-colors">
             📊 Resumo do Mês
          </button>
          <button onClick={() => handleSend("Quem são os clientes mais recentes?")} className="whitespace-nowrap px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-100 hover:bg-purple-100 transition-colors">
             👥 Clientes Recentes
          </button>
          <button onClick={() => handleSend("Qual meu lucro total hoje?")} className="whitespace-nowrap px-3 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-100 hover:bg-emerald-100 transition-colors">
             💰 Lucro Hoje
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 space-y-2">
          {/* Attachments Preview */}
          {(selectedImage || selectedFile) && (
             <div className="flex gap-2">
               {selectedImage && (
                <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg w-fit text-xs animate-fade-in">
                  <ImageIcon size={14} className="text-blue-500" /> Imagem
                  <button onClick={() => setSelectedImage(null)} className="hover:bg-slate-200 rounded p-0.5"><X size={14} /></button>
                </div>
               )}
               {selectedFile && (
                <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg w-fit text-xs animate-fade-in">
                  <FileText size={14} className="text-orange-500" /> {selectedFile.name.length > 15 ? selectedFile.name.substring(0,12)+'...' : selectedFile.name}
                  <button onClick={() => setSelectedFile(null)} className="hover:bg-slate-200 rounded p-0.5"><X size={14} /></button>
                </div>
               )}
             </div>
          )}

          <div className="flex items-center gap-2">
            <label className="p-2 text-slate-400 hover:text-orange-600 cursor-pointer hover:bg-slate-50 rounded-full transition-colors" title="Anexar Arquivo (PDF, CSV, Doc)">
              <Paperclip size={20} />
              <input type="file" className="hidden" onChange={onSelectFile} disabled={isLoading} />
            </label>
            <label className="p-2 text-slate-400 hover:text-blue-600 cursor-pointer hover:bg-slate-50 rounded-full transition-colors" title="Enviar Imagem">
              <ImageIcon size={20} />
              <input type="file" accept="image/*" className="hidden" onChange={onSelectImage} disabled={isLoading} />
            </label>
            <button 
              onClick={toggleRecording}
              className={`p-2 rounded-full transition-all ${isRecording ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-200' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
              title="Gravar Áudio"
            >
              {isRecording ? <StopCircle size={20} /> : <Mic size={20} />}
            </button>
            <input 
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
              placeholder={isRecording ? "Gravando..." : "Pergunte sobre seus dados..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isRecording}
            />
            <button 
              onClick={() => handleSend()}
              disabled={isLoading || (!input && !selectedImage && !selectedFile)}
              className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-200 transition-all active:scale-95"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};