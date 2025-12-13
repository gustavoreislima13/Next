import React, { useState, useRef, useEffect } from 'react';
import { generateBusinessInsight, AIMode, naiveRepairJSON } from '../services/geminiService';
import { db } from '../services/db';
import { StoredFile, Client, Transaction } from '../types';
import { Send, Bot, RefreshCw, Key, ArrowRight, Mic, Image as ImageIcon, X, Zap, Brain, Sparkles, StopCircle, Radio, MessageCircle, Paperclip, FileText, Database, AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AI: React.FC = () => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'Olá! Sou a I.A. Nexus. Tenho acesso completo ao banco de dados. \n\nVocê pode me perguntar coisas como: \n- "Quanto faturamos este mês?" \n- "Analise este arquivo PDF" \n- "Extraia os dados deste anexo para o sistema".' }
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
      
      // Intelligent Mode Switching for PDFs
      let activeMode = aiMode;
      let effectivePrompt = textToSend || "";
      let useExtractionLogic = false;

      // Logic for File Processing
      if (fileToSend) {
        // 1. Save to Files Database
        const storedFile: StoredFile = {
            id: crypto.randomUUID(),
            name: fileToSend.name,
            size: (fileToSend.size / 1024 / 1024).toFixed(2) + ' MB',
            date: new Date().toISOString(),
            type: fileToSend.type.includes('pdf') ? 'pdf' : fileToSend.type.includes('image') ? 'image' : 'other'
        };
        await db.addFile(storedFile);

        // 2. Prepare for AI
        const reader = new FileReader();
        documentData = await new Promise<string>((resolve) => {
            reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
            reader.readAsDataURL(fileToSend);
        });
        documentMime = fileToSend.type;

        // 3. Smart Extraction Trigger
        const isPdf = fileToSend.type.includes('pdf');
        const userWantsExtraction = effectivePrompt.toLowerCase().match(/(ler|extrair|importar|cadastrar|salvar|analisar dados)/) || !effectivePrompt;
        
        if (isPdf && userWantsExtraction) {
          activeMode = 'thinking'; // Force High Intelligence
          useExtractionLogic = true;
          
          effectivePrompt = `${effectivePrompt}\n\n
          MODO DE PRECISÃO EXTREMA (DATA ENTRY):
          Analise o documento PDF fornecido linha por linha.
          Extraia TODOS os dados encontrados de Clientes e Transações Financeiras.
          
          SAÍDA OBRIGATÓRIA (JSON ESTRITO):
          {
            "clients": [{ "name": "...", "cpf": "...", "email": "...", "mobile": "..." }],
            "transactions": [{ "date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "income/expense" }]
          }
          
          Regras:
          1. Se encontrar tabelas financeiras, capture cada linha como uma transação.
          2. Determine 'income' ou 'expense' pelo contexto (Débito/Crédito/Sinal).
          3. Não resuma. Capture todos os dados. Se houver 100 linhas, retorne 100 objetos.
          4. USE vírgulas para separar objetos.
          `;
        } else if (isPdf) {
          // Just generic analysis, but still suggest thinking for PDF
          activeMode = 'thinking';
        }
      }

      // Call API
      const responseText = await generateBusinessInsight({
        prompt: effectivePrompt,
        image: imgToSend?.data,
        document: documentData,
        mimeType: imgToSend?.mimeType || documentMime,
        mode: activeMode,
        responseMimeType: useExtractionLogic ? 'application/json' : undefined
      });

      // Post-Processing: Did we get JSON data to save?
      if (useExtractionLogic || responseText.trim().startsWith('{')) {
        let data: any = {};
        let parseSuccess = false;
        let candidate = responseText;
        const maxRetries = 50;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const repaired = naiveRepairJSON(candidate);
                data = JSON.parse(repaired);
                parseSuccess = true;
                break;
            } catch (e) {
                // Determine where to cut for the next attempt (backtrack)
                const lastClose = candidate.lastIndexOf('}');
                if (lastClose === -1) break; 
                candidate = candidate.substring(0, lastClose);
                if (candidate.length < 10) break;
            }
        }

        if (parseSuccess) {
          let savedMsg = "";
          let countClients = 0;
          let countTx = 0;

          if (data.clients && Array.isArray(data.clients) && data.clients.length > 0) {
             const newClients = data.clients.map((c: any) => ({
               id: crypto.randomUUID(), createdAt: new Date().toISOString(),
               name: c.name || 'Sem Nome', cpf: c.cpf || '', mobile: c.mobile || '', email: c.email || ''
             }));
             await db.bulkUpsertClients(newClients);
             countClients = newClients.length;
          }

          if (data.transactions && Array.isArray(data.transactions) && data.transactions.length > 0) {
             const newTx = data.transactions.map((t: any) => ({
               id: crypto.randomUUID(),
               date: t.date || new Date().toISOString(),
               description: t.description || 'Importado via AI',
               amount: Number(t.amount) || 0,
               type: (t.type === 'expense') ? 'expense' : 'income',
               category: 'Importado',
               entity: 'Geral'
             }));
             await db.bulkUpsertTransactions(newTx as Transaction[]);
             countTx = newTx.length;
          }

          if (countClients > 0 || countTx > 0) {
             savedMsg = `<br/><br/><b>✅ Automático:</b> Salvei ${countClients} clientes e ${countTx} transações no banco de dados.`;
          }

          // If it was pure JSON, render a friendly message + the save confirmation
          if (useExtractionLogic) {
             setMessages(prev => [...prev, { role: 'ai', text: `Análise concluída com sucesso.${savedMsg}<br/><br/><pre class="text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded overflow-auto max-h-40">${JSON.stringify(data, null, 2)}</pre>` }]);
          } else {
             // It was a chat response that happened to have JSON
             setMessages(prev => [...prev, { role: 'ai', text: responseText + savedMsg }]);
          }
        } else {
          // Fallback: It wasn't valid JSON even after repair, just show text
          setMessages(prev => [...prev, { role: 'ai', text: responseText }]);
        }
      } else {
        // Standard Text Response
        setMessages(prev => [...prev, { role: 'ai', text: responseText }]);
      }

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
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/20">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Nexus AI</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${apiKeyMissing ? 'bg-red-500' : 'bg-emerald-500'}`} />
              <span className="text-slate-600 dark:text-slate-400">{apiKeyMissing ? 'Sem Chave de API' : 'Conectado ao Banco de Dados'}</span>
            </div>
          </div>
        </div>
        
        {/* Modes */}
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
          <button 
            onClick={() => setAiMode('fast')}
            title="Rápido (Flash Lite)"
            className={`p-1.5 rounded-md transition-all ${aiMode === 'fast' ? 'bg-white dark:bg-slate-700 shadow text-yellow-600 dark:text-yellow-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Zap size={16} />
          </button>
          <button 
            onClick={() => setAiMode('standard')}
            title="Padrão (Flash)"
            className={`p-1.5 rounded-md transition-all ${aiMode === 'standard' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Sparkles size={16} />
          </button>
          <button 
            onClick={() => setAiMode('thinking')}
            title="Raciocínio (Pro Thinking)"
            className={`p-1.5 rounded-md transition-all ${aiMode === 'thinking' ? 'bg-white dark:bg-slate-700 shadow text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Brain size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50 dark:bg-slate-950/50" ref={scrollRef}>
        {apiKeyMissing && (
           <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg flex gap-3 text-amber-900 dark:text-amber-200 text-sm">
             <Key className="shrink-0" />
             <div>
               Configure sua chave API em <Link to="/config?tab=api" className="underline font-bold">Configurações</Link>.
             </div>
           </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`
              max-w-[85%] rounded-2xl p-4 text-sm shadow-sm relative
              ${m.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-none text-slate-700 dark:text-slate-200'}
            `}>
              {m.role === 'ai' && (m.text.includes('CRITICAL_ERROR_LEAKED_KEY') || m.text.includes('PERMISSION_DENIED')) ? (
                  <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400 border-b border-rose-100 dark:border-rose-900 pb-2">
                          <AlertTriangle size={20} />
                          Chave de API Bloqueada/Vazada
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">
                          O Google detectou que sua chave de API foi exposta publicamente e a bloqueou por segurança. Esta chave não funcionará mais.
                      </p>
                      <div className="bg-rose-50 dark:bg-rose-900/20 p-3 rounded-lg border border-rose-100 dark:border-rose-800 space-y-2">
                          <p className="font-bold text-rose-800 dark:text-rose-300 text-xs uppercase">Ação Necessária</p>
                          <a 
                             href="https://aistudio.google.com/app/apikey" 
                             target="_blank" 
                             rel="noreferrer"
                             className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline font-bold"
                          >
                             <ExternalLink size={16} /> 1. Gerar Nova Chave (Google AI Studio)
                          </a>
                          <Link to="/config?tab=api" className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline font-bold">
                             <Key size={16} /> 2. Atualizar nas Configurações
                          </Link>
                      </div>
                      <p className="text-xs text-slate-400 italic">
                          Dica: Se estiver usando o arquivo <code>.env</code>, atualize-o e reinicie o servidor com <code>npm run dev</code>.
                      </p>
                  </div>
              ) : (
                  <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>') }} />
              )}
              
              {m.role === 'ai' && <div className="absolute -bottom-5 left-0 text-[10px] text-slate-400">Nexus AI</div>}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
               <RefreshCw size={16} className="animate-spin text-blue-600 dark:text-blue-400" />
               {selectedFile?.type.includes('pdf') ? 'Analisando documento (Modo Thinking)...' : aiMode === 'thinking' ? 'Pensando profundamente...' : 'Processando...'}
             </div>
          </div>
        )}
      </div>

      {/* Quick Suggestions & Input */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        {/* Quick Chips */}
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={() => handleSend("Resumo financeiro deste mês")} className="whitespace-nowrap px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
             📊 Resumo do Mês
          </button>
          <button onClick={() => handleSend("Quem são os clientes mais recentes?")} className="whitespace-nowrap px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full border border-purple-100 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors">
             👥 Clientes Recentes
          </button>
          <button onClick={() => handleSend("Qual meu lucro total hoje?")} className="whitespace-nowrap px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs rounded-full border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">
             💰 Lucro Hoje
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 space-y-2">
          {/* Attachments Preview */}
          {(selectedImage || selectedFile) && (
             <div className="flex gap-2">
               {selectedImage && (
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg w-fit text-xs animate-fade-in text-slate-700 dark:text-slate-300">
                  <ImageIcon size={14} className="text-blue-500" /> Imagem
                  <button onClick={() => setSelectedImage(null)} className="hover:bg-slate-200 dark:hover:bg-slate-700 rounded p-0.5"><X size={14} /></button>
                </div>
               )}
               {selectedFile && (
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg w-fit text-xs animate-fade-in text-slate-700 dark:text-slate-300">
                  <FileText size={14} className="text-orange-500" /> {selectedFile.name.length > 15 ? selectedFile.name.substring(0,12)+'...' : selectedFile.name}
                  <button onClick={() => setSelectedFile(null)} className="hover:bg-slate-200 dark:hover:bg-slate-700 rounded p-0.5"><X size={14} /></button>
                </div>
               )}
             </div>
          )}

          <div className="flex items-center gap-2">
            <label className="p-2 text-slate-400 hover:text-orange-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors" title="Anexar Arquivo (PDF, CSV, Doc)">
              <Paperclip size={20} />
              <input type="file" className="hidden" onChange={onSelectFile} disabled={isLoading} />
            </label>
            <label className="p-2 text-slate-400 hover:text-blue-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors" title="Enviar Imagem">
              <ImageIcon size={20} />
              <input type="file" accept="image/*" className="hidden" onChange={onSelectImage} disabled={isLoading} />
            </label>
            <button 
              onClick={toggleRecording}
              className={`p-2 rounded-full transition-all ${isRecording ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse ring-2 ring-red-200 dark:ring-red-900' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              title="Gravar Áudio"
            >
              {isRecording ? <StopCircle size={20} /> : <Mic size={20} />}
            </button>
            <input 
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all placeholder:text-slate-400 dark:text-white"
              placeholder={isRecording ? "Gravando..." : "Pergunte sobre seus dados..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isRecording}
            />
            <button 
              onClick={() => handleSend()}
              disabled={isLoading || (!input && !selectedImage && !selectedFile)}
              className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-200 dark:shadow-blue-900/20 transition-all active:scale-95"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};