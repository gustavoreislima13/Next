import React, { useState, useRef, useEffect } from 'react';
import { generateBusinessInsight, AIMode } from '../services/geminiService';
import { db } from '../services/db';
import { Send, Bot, RefreshCw, Key, ArrowRight, Mic, Image as ImageIcon, X, Zap, Brain, Sparkles, StopCircle, Radio } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export const AI: React.FC = () => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Olá! Sou a I.A. Nexus. Posso analisar dados, ver imagens ou ouvir seus comandos. Experimente me enviar uma foto de recibo ou gravar um áudio.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  
  // Controls
  const [aiMode, setAiMode] = useState<AIMode>('standard');
  const [selectedImage, setSelectedImage] = useState<{data: string, mimeType: string} | null>(null);
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

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userText = input;
    setInput('');
    const imgToSend = selectedImage;
    setSelectedImage(null);
    setIsLoading(true);

    // Optimistic UI
    const parts = [];
    if (imgToSend) parts.push('[Imagem Anexada]');
    if (userText) parts.push(userText);
    setMessages(prev => [...prev, { role: 'user', text: parts.join(' ') }]);

    try {
      const response = await generateBusinessInsight({
        prompt: userText,
        image: imgToSend?.data,
        mimeType: imgToSend?.mimeType,
        mode: aiMode
      });
      setMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: "Erro ao processar solicitação." }]);
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
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Nexus AI</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${apiKeyMissing ? 'bg-red-500' : 'bg-emerald-500'}`} />
              {apiKeyMissing ? 'Sem Chave de API' : 'Online'}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50" ref={scrollRef}>
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
            <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 rounded-bl-none'}`}>
              <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>') }} />
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-3 shadow-sm flex items-center gap-2 text-xs text-slate-500">
               <RefreshCw size={14} className="animate-spin text-blue-600" />
               {aiMode === 'thinking' ? 'Pensando (pode levar alguns segundos)...' : 'Processando...'}
             </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-slate-100 space-y-2">
        {selectedImage && (
          <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg w-fit text-xs">
            <ImageIcon size={14} /> Imagem selecionada
            <button onClick={() => setSelectedImage(null)}><X size={14} /></button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="p-2 text-slate-400 hover:text-blue-600 cursor-pointer hover:bg-slate-50 rounded-full">
            <ImageIcon size={20} />
            <input type="file" accept="image/*" className="hidden" onChange={onSelectImage} disabled={isLoading} />
          </label>
          <button 
            onClick={toggleRecording}
            className={`p-2 rounded-full transition-colors ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
          >
            {isRecording ? <StopCircle size={20} /> : <Mic size={20} />}
          </button>
          <input 
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder={isRecording ? "Gravando..." : "Digite sua mensagem..."}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || isRecording}
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || (!input && !selectedImage)}
            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};