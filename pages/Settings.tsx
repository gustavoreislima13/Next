import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../services/db';
import { AppSettings, Client, Transaction, UserProfile, User, AuditLog } from '../types';
import { generateBusinessInsight } from '../services/geminiService';
import { Save, Database, Key, CheckCircle, AlertCircle, ExternalLink, Download, Upload, FileText, User as UserIcon, Camera, FileUp, Sparkles, RefreshCw, Users, Shield, Trash2, History, Activity, ArrowDownCircle, ArrowUpCircle, MousePointer2, FileType, Terminal, XCircle, PlusCircle } from 'lucide-react';

interface LogEntry {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'new';
  message: string;
  timestamp: string;
}

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
  const [importLogs, setImportLogs] = useState<LogEntry[]>([]);
  const [importTxType, setImportTxType] = useState<'auto' | 'income' | 'expense'>('auto');
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // PDF to CSV State
  const [isConverting, setIsConverting] = useState(false);

  // API Key Status
  const hasEnvKey = (() => {
    try { return !!process.env.API_KEY; } catch { return false; }
  })();

  useEffect(() => {
     db.getSettings().then(setSettings);
     setIsSupabaseConnected(db.isSupabaseConfigured());
     loadTeamAndLogs();
     setCurrentUser(db.getCurrentUser());
  }, []);

  useEffect(() => {
    // Auto-scroll logs
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [importLogs]);

  const loadTeamAndLogs = async () => {
    const users = await db.getUsers();
    setTeam(users);
    const activity = await db.getLogs();
    setLogs(activity);
  };

  const addImportLog = (type: LogEntry['type'], message: string) => {
    setImportLogs(prev => [...prev, {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const clearImportLogs = () => setImportLogs([]);

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
    if (lines.length < 2) return { rows: [], headers: [] };
    
    // Determine separator (comma or semicolon) based on first line
    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';

    // Parse Headers
    const rawHeaders = firstLine.split(separator).map(h => h.trim().replace(/"/g, ''));
    const headers = rawHeaders.map(normalizeHeader);
    
    const rows = lines.slice(1).map(line => {
      // Regex to split by separator but ignore separators inside quotes
      const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
      const values = line.split(regex);
      
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
        if (!val) return;

        // --- Clients ---
        // Name
        if (['name', 'nome', 'cliente', 'nome do cliente', 'nome fantasia', 'razao social', 'razao', 'sacado', 'tomador', 'titular', 'consumidor', 'destinatario', 'pagador', 'comprador'].some(k => h.includes(k))) obj.mapped_name = val;
        // CPF/CNPJ
        if (['cpf', 'cnpj', 'documento', 'doc', 'cpf/cnpj', 'inscricao', 'identificacao', 'nif', 'passaporte', 'cpf_cnpj'].some(k => h.includes(k))) obj.mapped_cpf = val;
        // Email
        if (['email', 'e-mail', 'mail', 'correio', 'eletronico', 'contato', 'usuario'].some(k => h.includes(k))) obj.mapped_email = val;
        // Phone
        if (['mobile', 'celular', 'telefone', 'tel', 'whatsapp', 'phone', 'fone', 'contato'].some(k => h.includes(k))) obj.mapped_mobile = val;
        
        // --- Transactions ---
        // 1. Value/Amount (Priority)
        if (['valor', 'amount', 'total', 'vlr', 'preco', 'liquido', 'bruto', 'recebimento', 'pagamento', 'crédito', 'débito', 'entrada', 'saida'].some(k => h.includes(k))) {
            obj.mapped_amount = val;
        }
        // Expense inference
        if (['saida', 'debito', 'despesa', 'pagamento'].some(k => h.includes(k))) { 
            obj.force_expense = true; 
        }
        // Income inference
        if (['entrada', 'credito', 'receita', 'recebimento'].some(k => h.includes(k))) { 
            obj.force_income = true; 
        }

        // 2. Description
        if (['descrição', 'descricao', 'historico', 'histórico', 'description', 'discriminacao', 'detalhe', 'memo', 'referencia', 'narrativa', 'produto', 'servico', 'observacao', 'obs'].some(k => h.includes(k))) obj.mapped_desc = val;
        
        // 3. Date
        if (['data', 'date', 'dia', 'dt', 'emissao', 'lancamento', 'movimento', 'competencia', 'vencimento', 'pagamento', 'data_emissao', 'data_vencimento'].some(k => h.includes(k))) obj.mapped_date = val;
        
        // 4. Code / Código
        if (['código', 'codigo', 'cod', 'id', 'ref', 'code', 'numero', 'num', 'documento', 'n doc', 'controle', 'n_doc', 'num_doc', 'nota fiscal', 'nf'].some(k => h === k || h.startsWith(k) || h.endsWith(k))) obj.mapped_code = val;
        
        // 5. Account / Conta
        if (['conta', 'banco', 'account', 'agencia', 'carteira', 'origem', 'destino', 'instituicao', 'portador'].some(k => h.includes(k))) obj.mapped_account = val;
        
        // 6. Category / Categoria
        if (['categoria', 'category', 'classificacao', 'natureza', 'grupo', 'tipo', 'plano', 'subcategoria'].some(k => h.includes(k))) obj.mapped_category = val;
        
        // 7. Entity / Entidade
        if (['entidade', 'entity', 'empresa', 'unidade', 'loja', 'filial', 'centro de custo', 'cc', 'estabelecimento', 'fornecedor', 'cliente'].some(k => h.includes(k))) obj.mapped_entity = val;
      });

      return obj;
    });

    return { rows, headers: rawHeaders };
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>, type: 'clients' | 'tx') => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearImportLogs();
    setIsImporting(true);
    addImportLog('info', `Iniciando leitura do arquivo: ${file.name}`);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      try {
        const { rows, headers } = parseCSV(text);
        if (rows.length === 0) {
            addImportLog('error', "Arquivo vazio ou formato inválido.");
            setIsImporting(false);
            return;
        }

        addImportLog('info', `Cabeçalhos detectados: ${headers.join(', ')}`);
        addImportLog('info', `Processando ${rows.length} linhas...`);

        // --- Helpers for Formatting ---
        const parseCurrency = (val: string) => {
          if (!val) return 0;
          let clean = String(val).trim();
          const isNegativeParenthesis = clean.startsWith('(') && clean.endsWith(')');
          if (isNegativeParenthesis) clean = clean.replace(/[()]/g, '');
          clean = clean.replace(/[R$\s]/g, '');
          
          const lastComma = clean.lastIndexOf(',');
          const lastDot = clean.lastIndexOf('.');

          if (lastComma > lastDot) { // PT-BR
            clean = clean.replace(/\./g, '').replace(',', '.');
          } else if (lastDot > lastComma) { // US
            clean = clean.replace(/,/g, '');
          }
          let num = parseFloat(clean);
          if (isNaN(num)) return 0;
          if (isNegativeParenthesis) num = -Math.abs(num);
          return num;
        };

        const parseDate = (val: string) => {
          if (!val) return new Date().toISOString();
          if (val.includes('/')) {
            const parts = val.split('/');
            if (parts.length === 3) {
               if (parseInt(parts[2]) > 1900) return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YYYY
               else if (parseInt(parts[0]) > 1900) return `${parts[0]}-${parts[1]}-${parts[2]}`; // YYYY/MM/DD
            }
          }
          const d = new Date(val);
          return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
        };
        // ------------------------------
        
        if (type === 'clients') {
            const clients: Client[] = rows.map((r: any, idx): Client | null => {
                const name = r.mapped_name || r.name || r.Nome || 'Sem Nome';
                const cpf = r.mapped_cpf || r.cpf || '';
                
                if (name === 'Sem Nome' && !cpf) {
                    addImportLog('warning', `Linha ${idx + 2}: Ignorada (sem nome ou CPF).`);
                    return null;
                } else {
                    addImportLog('success', `[OK] Cliente: ${name} (${cpf})`);
                }

                return {
                    id: crypto.randomUUID(),
                    name,
                    cpf,
                    mobile: r.mapped_mobile || r.mobile || '',
                    email: r.mapped_email || r.email || '',
                    createdAt: new Date().toISOString()
                };
            }).filter((c): c is Client => c !== null);

            if (clients.length > 0) {
                await db.bulkUpsertClients(clients);
                addImportLog('success', `✅ Importação Concluída: ${clients.length} clientes salvos.`);
            } else {
                addImportLog('warning', `Nenhum cliente válido encontrado.`);
            }

        } else {
             // Track new Categories and Entities
             const newCategories = new Set<string>();
             const newEntities = new Set<string>();
             const validTxs: Transaction[] = [];

             rows.forEach((r: any, idx) => {
                const amount = parseCurrency(r.mapped_amount || r.amount || '0');
                if (amount === 0) {
                    addImportLog('warning', `Linha ${idx+2}: Ignorada (Valor zerado ou inválido).`);
                    return;
                }
                
                let txType: 'income' | 'expense' = 'income';
                if (r.force_expense) txType = 'expense';
                else if (r.force_income) txType = 'income';
                else if (amount < 0) txType = 'expense';
                else if (importTxType === 'income') txType = 'income';
                else if (importTxType === 'expense') txType = 'expense';
                
                const desc = r.mapped_desc || r.description || 'Importado via CSV';
                const category = r.mapped_category || r.Categoria || 'Outros';
                const entity = r.mapped_entity || r.Entidade || settings.entities[0] || 'Geral';

                // Check for new registers
                if (category && category !== 'Outros' && !settings.categories.includes(category) && !newCategories.has(category)) {
                    newCategories.add(category);
                    addImportLog('new', `[NOVO] Categoria identificada: "${category}" - Será criada.`);
                }

                if (entity && entity !== 'Geral' && !settings.entities.includes(entity) && !newEntities.has(entity)) {
                    newEntities.add(entity);
                    addImportLog('new', `[NOVO] Entidade/Empresa identificada: "${entity}" - Será criada.`);
                }

                addImportLog('success', `[OK] ${txType === 'income' ? 'Receita' : 'Despesa'}: ${desc} | R$ ${Math.abs(amount).toFixed(2)}`);

                validTxs.push({
                  id: crypto.randomUUID(),
                  type: txType,
                  description: desc,
                  amount: Math.abs(amount),
                  date: parseDate(r.mapped_date || r.date),
                  entity: entity,
                  category: category,
                  observation: r.mapped_account ? `Conta: ${r.mapped_account} ${r.observation||''}` : r.observation || '',
                  clientId: r.clientId,
                  serviceType: r.serviceType,
                  consultant: r.consultant,
                  supplier: r.supplier
                });
            });

            // Update Settings with new cats/entities
            if (newCategories.size > 0 || newEntities.size > 0) {
              const updatedSettings = { ...settings };
              newCategories.forEach(c => updatedSettings.categories.push(c));
              newEntities.forEach(e => updatedSettings.entities.push(e));
              await db.updateSettings(updatedSettings);
              setSettings(updatedSettings);
              addImportLog('info', `⚙️ Configurações atualizadas com ${newCategories.size} novas categorias e ${newEntities.size} novas entidades.`);
            }

            if (validTxs.length > 0) {
                await db.bulkUpsertTransactions(validTxs);
                addImportLog('success', `✅ Importação Concluída: ${validTxs.length} transações salvas.`);
            } else {
                addImportLog('error', `Nenhuma transação válida encontrada.`);
            }
        }
        e.target.value = '';
      } catch (error: any) {
        addImportLog('error', `Erro crítico: ${error.message}`);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  // --- PDF Import & Repair Logic ---

  const naiveRepairJSON = (jsonStr: string): string => {
    // 1. Remove Markdown
    let cleaned = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

    // 2. Locate actual JSON start
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let start = -1;
    if (firstBrace > -1 && firstBracket > -1) start = Math.min(firstBrace, firstBracket);
    else if (firstBrace > -1) start = firstBrace;
    else if (firstBracket > -1) start = firstBracket;
    
    if (start > -1) {
        cleaned = cleaned.substring(start);
    }

    // 3. Fix common AI errors (missing commas)
    // Objects in array: } { -> }, {
    cleaned = cleaned.replace(/}\s*{/g, '}, {'); 
    // Arrays in array: ] [ -> ], [
    cleaned = cleaned.replace(/]\s*\[/g, '], ['); 
    // String value to Key: "val" "key" -> "val", "key"
    cleaned = cleaned.replace(/"\s+"(?=\w)/g, '", "'); 
    // Number/Bool/Null value to Key: 123 "key" -> 123, "key"
    cleaned = cleaned.replace(/(\d+|true|false|null)\s+"(?=\w)/g, '$1, "');

    // 4. Fix unclosed string at the end (truncated)
    const quoteCount = (cleaned.match(/"/g) || []).length - (cleaned.match(/\\"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        cleaned += '"';
    }

    // 5. Remove trailing comma if present
    if (cleaned.trim().endsWith(',')) {
        cleaned = cleaned.trim().slice(0, -1);
    }

    // 6. Balance Braces/Brackets
    const openBraces = (cleaned.match(/{/g) || []).length;
    const closeBraces = (cleaned.match(/}/g) || []).length;
    const openBrackets = (cleaned.match(/\[/g) || []).length;
    const closeBrackets = (cleaned.match(/\]/g) || []).length;

    let diffBraces = openBraces - closeBraces;
    while (diffBraces > 0) { cleaned += "}"; diffBraces--; }

    let diffBrackets = openBrackets - closeBrackets;
    while (diffBrackets > 0) { cleaned += "]"; diffBrackets--; }

    return cleaned;
  };

  const handleLegacyPDFImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Por favor, selecione um arquivo PDF.");
      return;
    }

    clearImportLogs();
    setIsImporting(true);
    addImportLog('info', 'Lendo arquivo PDF em modo de ALTA CAPACIDADE (Batch Processing)...');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64 = (ev.target?.result as string).split(',')[1];
        addImportLog('info', 'Enviando para I.A. Nexus para extração estruturada...');
        
        let txInstruction = '';
        if (importTxType === 'income') {
          txInstruction = "Force 'type': 'income' para todas as transações.";
        } else if (importTxType === 'expense') {
          txInstruction = "Force 'type': 'expense' para todas as transações.";
        } else {
          txInstruction = "Determine 'income' ou 'expense' pelo contexto (Crédito/Débito, Entrada/Saída ou sinal negativo).";
        }

        const prompt = `
          TAREFA: Extração de Dados Financeiros (Strict Mode).
          
          Analise o PDF fornecido. Extraia TODOS os Clientes e TODAS as Transações financeiras encontradas, linha por linha, sem resumir.
          
          SAÍDA OBRIGATÓRIA (JSON ESTRICTO):
          {
            "clients": [{"name":"...","cpf":"...","email":"...","mobile":"..."}],
            "transactions": [
              {
                "date": "YYYY-MM-DD",
                "description": "...",
                "amount": 100.00,
                "type": "income/expense",
                "code": "...",
                "account": "...",
                "category": "...",
                "entity": "..."
              }
            ]
          }

          REGRAS DE EXTRAÇÃO:
          1. Tente identificar e extrair exatamente as colunas solicitadas: "Código", "Conta", "Categoria", "Entidade", "Descrição", "Data", "Valor".
          2. Mapeie essas colunas para os campos JSON correspondentes:
             - Código -> code
             - Conta -> account
             - Categoria -> category
             - Entidade -> entity (Se for Nome do Cliente ou Fornecedor, coloque aqui)
             - Descrição -> description
             - Data -> date
             - Valor -> amount
          3. ${txInstruction}
          4. NÃO altere os dados. Copie as descrições e códigos na íntegra.
          5. Use o formato de data YYYY-MM-DD. Use ponto para decimais no valor numérico.
          
          IMPORTANTE:
          - Capture TUDO. Se houver 500 linhas, retorne 500 objetos.
          - NÃO adicione texto antes ou depois do JSON.
        `;

        const responseText = await generateBusinessInsight({
          prompt: prompt,
          document: base64,
          mode: 'thinking',
          responseMimeType: 'application/json' // Force strictly valid JSON output
        });

        addImportLog('info', 'Resposta recebida. Processando JSON...');

        // --- ROBUST BACKTRACKING PARSER ---
        let data: any = {};
        let parseSuccess = false;
        let candidate = responseText;
        const maxRetries = 50; 

        for (let i = 0; i < maxRetries; i++) {
            try {
                const repaired = naiveRepairJSON(candidate);
                data = JSON.parse(repaired);
                parseSuccess = true;
                if (i > 0) {
                     addImportLog('warning', `JSON recuperado após ${i} tentativa(s) de reparo.`);
                }
                break;
            } catch (e) {
                const lastClose = candidate.lastIndexOf('}');
                if (lastClose === -1) break; 
                candidate = candidate.substring(0, lastClose);
                if (candidate.length < 10) break;
            }
        }
        
        if (!parseSuccess) {
             throw new Error("Falha crítica no parsing do JSON retornado pela IA.");
        }
        // ------------------------------------
        
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
                addImportLog('success', `[PDF] Cliente Encontrado: ${c.name}`);
              }
          });
        }

        if (data.transactions && Array.isArray(data.transactions)) {
          data.transactions.forEach((t: any) => {
            if (t.description && t.amount) {
              const codeStr = t.code ? `[Cód: ${t.code}] ` : '';
              const accStr = t.account ? `Conta: ${t.account}` : '';
              const amount = Number(t.amount);
              
              newTxs.push({
                id: crypto.randomUUID(),
                type: t.type === 'expense' ? 'expense' : 'income',
                description: `${codeStr}${t.description}`.trim(),
                amount: amount,
                date: t.date || new Date().toISOString(),
                entity: t.entity || 'Importado',
                category: t.category || 'Geral',
                observation: accStr
              });
              addImportLog('success', `[PDF] Transação: ${t.description} | R$ ${amount}`);
            }
          });
        }

        if (newClients.length > 0) {
          await db.bulkUpsertClients(newClients);
        }
        if (newTxs.length > 0) {
          await db.bulkUpsertTransactions(newTxs);
        }

        if (newClients.length === 0 && newTxs.length === 0) {
          addImportLog('error', "Nenhum dado estruturado encontrado no PDF.");
        } else {
            addImportLog('success', `✅ Processamento Finalizado: ${newClients.length} clientes e ${newTxs.length} transações importadas.`);
        }

      } catch (error: any) {
        addImportLog('error', `Erro Crítico na Importação: ${error.message}`);
        console.error(error);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePdfToCsvConversion = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Selecione um arquivo PDF.");
      return;
    }

    clearImportLogs();
    setIsConverting(true);
    addImportLog('info', "Iniciando conversão PDF -> CSV...");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64 = (ev.target?.result as string).split(',')[1];
        
        const prompt = `
          CONVERSOR PDF PARA CSV (MODO ESTRITO)
          Analise o PDF e extraia os dados financeiros com precisão absoluta.
          
          COLUNAS OBRIGATÓRIAS (nesta ordem exata):
          Código;Conta;Categoria;Entidade;Descrição;Data;Valor

          REGRAS CRÍTICAS:
          1. Identifique as colunas correspondentes no PDF (ex: "Num Doc" -> "Código", "Histórico" -> "Descrição", "Crédito/Débito" -> "Valor").
          2. Se uma coluna (como Entidade ou Categoria) não existir no PDF, deixe o campo vazio entre os ponto-e-vírgulas (ex: ;;;).
          3. NÃO invente dados. Extraia exatamente o que está escrito.
          4. Formato de Data: DD/MM/AAAA
          5. Formato de Valor: R$ 0,00 (formato brasileiro com vírgula). Use sinal de menos (-) APENAS se for explícito no PDF ou coluna de débito.
          6. Use ponto-e-vírgula ';' como separador.
          7. PRIMEIRA LINHA deve ser o cabeçalho.
          8. NÃO resuma, extraia linha a linha.
        `;

        const responseText = await generateBusinessInsight({
          prompt: prompt,
          document: base64,
          mode: 'thinking',
        });

        // Clean markdown
        const cleanCsv = responseText.replace(/```csv/g, '').replace(/```/g, '').trim();
        addImportLog('success', "CSV gerado pela IA.");

        // 1. Create blob and download (Keep existing feature)
        const blob = new Blob([cleanCsv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `convertido_${file.name.replace('.pdf', '')}.csv`;
        link.click();
        addImportLog('info', "Download do CSV iniciado.");

        // 2. Auto-Import Logic (New Request)
        const lines = cleanCsv.split('\n').filter(l => l.trim());
        
        // Skip Header if it matches expected
        if (lines.length > 1) {
             const dataLines = lines.slice(1);
             const newTxs: Transaction[] = [];
             
             dataLines.forEach(line => {
                 const cols = line.split(';');
                 // Expected: Code(0);Account(1);Category(2);Entity(3);Desc(4);Date(5);Value(6)
                 if (cols.length >= 7) {
                     const code = cols[0].trim();
                     const account = cols[1].trim();
                     const category = cols[2].trim() || 'Geral';
                     const entity = cols[3].trim() || settings.entities[0] || 'Geral';
                     const description = cols[4].trim();
                     const dateStr = cols[5].trim();
                     const valueStr = cols[6].trim();

                     // Formatting
                     // Parse Date: DD/MM/YYYY -> YYYY-MM-DD
                     let dateIso = new Date().toISOString();
                     if (dateStr.includes('/')) {
                        const parts = dateStr.split('/');
                        if (parts.length === 3) dateIso = `${parts[2]}-${parts[1]}-${parts[0]}`;
                     }

                     // Parse Amount: R$ 1.200,50 -> 1200.50
                     let cleanVal = valueStr.replace(/[R$\s]/g, '');
                     // Logic to distinguish PT-BR vs US
                     const lastComma = cleanVal.lastIndexOf(',');
                     const lastDot = cleanVal.lastIndexOf('.');
                     if (lastComma > lastDot) cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
                     else if (lastDot > lastComma) cleanVal = cleanVal.replace(/,/g, '');

                     let amount = parseFloat(cleanVal);
                     
                     if (description && !isNaN(amount)) {
                         newTxs.push({
                             id: crypto.randomUUID(),
                             type: amount < 0 ? 'expense' : 'income',
                             amount: Math.abs(amount),
                             description: `${code ? `[${code}] ` : ''}${description}`,
                             date: dateIso,
                             category: category,
                             entity: entity,
                             observation: account ? `Conta: ${account}` : ''
                         });
                         addImportLog('success', `[CSV-AUTO] Transação: ${description} | R$ ${Math.abs(amount)}`);
                     }
                 }
             });

             if (newTxs.length > 0) {
                 await db.bulkUpsertTransactions(newTxs);
                 addImportLog('success', `✅ Conversão e Importação concluídas! ${newTxs.length} registros salvos.`);
             } else {
                 addImportLog('warning', "CSV gerado, mas nenhum registro válido para importação automática.");
             }
        } else {
            addImportLog('error', "CSV vazio ou inválido.");
        }

      } catch (err: any) {
        addImportLog('error', `Erro na conversão: ${err.message}`);
      } finally {
        setIsConverting(false);
        // Reset input
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configurações</h1>
        {currentUser && (
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Logado como: {currentUser.name}</span>
        )}
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-4">
        {['general', 'profile', 'team', 'registers', 'import', 'api'].map(tab => (
           <button 
             key={tab}
             onClick={() => setActiveTab(tab)}
             className={`pb-2 px-1 capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
           >
             {tab === 'api' ? 'Integrações' : tab === 'import' ? 'Dados' : tab === 'registers' ? 'Cadastros' : tab === 'general' ? 'Geral' : tab === 'team' ? 'Equipe' : 'Perfil'}
           </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {activeTab === 'general' && (
          <div className="space-y-4 max-w-lg">
             <div>
               <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Razão Social</label>
               <input className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} />
             </div>
             <div>
               <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">CNPJ</label>
               <input className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" value={settings.cnpj} onChange={e => setSettings({...settings, cnpj: e.target.value})} />
             </div>
          </div>
        )}

        {/* ... (Existing Profile and Team tabs omitted for brevity, no changes there) ... */}
        {activeTab === 'profile' && (
          <div className="max-w-xl">
             <div className="flex items-center gap-6 mb-8">
               <div className="relative group shrink-0">
                 <div className="w-24 h-24 rounded-full border-4 border-slate-100 dark:border-slate-800 shadow-md overflow-hidden bg-slate-200 dark:bg-slate-800">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
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
                 <h3 className="text-lg font-bold text-slate-900 dark:text-white">Foto de Perfil</h3>
                 <p className="text-sm text-slate-500 dark:text-slate-400">Isso será exibido na barra lateral.</p>
               </div>
             </div>

             <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Nome de Exibição</label>
                  <input 
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                    value={profile.name} 
                    onChange={e => setProfile({...profile, name: e.target.value})} 
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Cargo / Função</label>
                  <input 
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
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
              <div className="md:col-span-1 border-r border-slate-100 dark:border-slate-800 pr-0 md:pr-8">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Users size={20}/> Adicionar Membro</h3>
                <div className="space-y-3">
                  <input 
                    placeholder="Nome Completo" 
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    value={newUser.name}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                  />
                  <input 
                    placeholder="Email (opcional)" 
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                  />
                  <select 
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Limite: 5 funcionários adicionais.</p>
                </div>
              </div>

              {/* User List */}
              <div className="md:col-span-2">
                 <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Membros da Equipe ({team.length})</h3>
                 <div className="space-y-3">
                   {team.map(user => (
                     <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow">
                       <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${user.role === 'Admin' ? 'bg-slate-800 dark:bg-slate-950' : 'bg-blue-500'}`}>
                            {user.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-sm">{user.name} {user.id === currentUser?.id && '(Você)'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{user.role}</p>
                          </div>
                       </div>
                       {user.role !== 'Admin' && (
                         <button onClick={() => handleDeleteUser(user.id)} className="text-rose-400 hover:text-rose-600 p-2">
                           <Trash2 size={16} />
                         </button>
                       )}
                       {user.role === 'Admin' && <span title="Admin Principal"><Shield size={16} className="text-slate-400" /></span>}
                     </div>
                   ))}
                 </div>
              </div>
            </div>

            {/* Audit Logs */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <History size={20} className="text-slate-500 dark:text-slate-400" /> Histórico de Atividades
              </h3>
              <div className="bg-slate-900 dark:bg-slate-950 rounded-xl overflow-hidden shadow-inner">
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
             <p className="text-sm text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-blue-700 dark:text-blue-300">Separe os itens por vírgula para criar múltiplas opções nos formulários.</p>
             <div>
               <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Empresas (Entidades)</label>
               <textarea className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-3 h-24 focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={settings.entities.join(', ')} onChange={e => setSettings({...settings, entities: e.target.value.split(',').map(s=>s.trim())})} />
             </div>
             <div>
               <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Tipos de Serviço (Extraídos do PDF ou Manuais)</label>
               <textarea className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-3 h-24 focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={settings.serviceTypes.join(', ')} onChange={e => setSettings({...settings, serviceTypes: e.target.value.split(',').map(s=>s.trim())})} />
             </div>
             <div>
               <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Categorias Financeiras</label>
               <textarea className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-3 h-24 focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={settings.categories.join(', ')} onChange={e => setSettings({...settings, categories: e.target.value.split(',').map(s=>s.trim())})} />
             </div>
           </div>
        )}

        {activeTab === 'import' && (
           <div className="space-y-6">
             {/* New Tool: PDF to CSV Converter */}
             <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-start gap-4">
                   <div className="p-3 bg-orange-100 dark:bg-orange-900/40 rounded-lg text-orange-600 dark:text-orange-400">
                     <FileType size={24} />
                   </div>
                   <div className="flex-1">
                     <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Conversor PDF para CSV + Importação</h3>
                     <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                       Converta seus extratos ou relatórios em PDF para CSV e <strong>importe automaticamente</strong> para o sistema.
                       <br/>Campos: <code>Código;Conta;Categoria;Entidade;Descrição;Data;Valor</code>.
                     </p>
                     <label className={`
                        inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm font-bold shadow-sm
                        ${isConverting ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'}
                      `}>
                         {isConverting ? <RefreshCw className="animate-spin" size={16} /> : <FileText size={16} />}
                         {isConverting ? 'Processando...' : 'Converter e Importar'}
                         <input 
                           type="file" 
                           accept="application/pdf" 
                           className="hidden" 
                           disabled={isConverting}
                           onChange={handlePdfToCsvConversion} 
                         />
                      </label>
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {/* Clientes Card */}
               <div className="border border-slate-200 dark:border-slate-800 p-6 rounded-xl text-center hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                 <h4 className="font-bold mb-2 text-slate-900 dark:text-white">Clientes</h4>
                 <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Gerencie sua base de clientes.</p>
                 <div className="space-y-3">
                   <button onClick={() => handleExport('clients')} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 w-full text-sm font-medium">
                     <Download size={16} /> Exportar CSV
                   </button>
                   <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2 w-full text-sm font-medium shadow-sm transition-all">
                     <Upload size={16} /> Importar CSV
                     <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImportCSV(e, 'clients')} />
                   </label>
                 </div>
               </div>

               {/* Financeiro Card */}
               <div className="border border-slate-200 dark:border-slate-800 p-6 rounded-xl text-center hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                 <h4 className="font-bold mb-2 text-slate-900 dark:text-white">Financeiro</h4>
                 <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Gerencie seu histórico financeiro.</p>
                 <div className="space-y-3">
                   <button onClick={() => handleExport('tx')} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-2 w-full text-sm font-medium">
                     <Download size={16} /> Exportar CSV
                   </button>
                   <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer flex items-center justify-center gap-2 w-full text-sm font-medium shadow-sm transition-all">
                     <Upload size={16} /> Importar CSV
                     <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImportCSV(e, 'tx')} />
                   </label>
                 </div>
               </div>
             </div>

             <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
               <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                 <Sparkles className="text-purple-600 dark:text-purple-400" /> Migração Inteligente (AI)
               </h3>
               
               <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                  <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="flex-1 space-y-4">
                      <div>
                        <h4 className="font-bold text-purple-900 dark:text-purple-300 mb-1">Importar do Sistema Antigo (PDF)</h4>
                        <p className="text-sm text-purple-700 dark:text-purple-400">
                          A I.A. fará uma leitura de <strong>Alta Precisão (JSON Bulk)</strong> para cadastrar clientes e transações. O sistema não usará ferramentas individuais para garantir que 100% dos dados sejam lidos.
                        </p>
                      </div>

                      <div className="bg-white/50 dark:bg-slate-800/50 p-3 rounded-lg border border-purple-100 dark:border-purple-800">
                        <label className="block text-xs font-bold text-purple-800 dark:text-purple-300 mb-2 uppercase tracking-wide">Como interpretar valores?</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                           <button 
                             onClick={() => setImportTxType('auto')}
                             className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${importTxType === 'auto' ? 'bg-white dark:bg-slate-800 border-purple-400 text-purple-800 dark:text-purple-300 shadow-sm' : 'border-transparent hover:bg-white/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}
                           >
                             <MousePointer2 size={14} /> Automático
                           </button>
                           <button 
                             onClick={() => setImportTxType('income')}
                             className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${importTxType === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 shadow-sm' : 'border-transparent hover:bg-white/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}
                           >
                             <ArrowUpCircle size={14} /> Forçar Receitas
                           </button>
                           <button 
                             onClick={() => setImportTxType('expense')}
                             className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${importTxType === 'expense' ? 'bg-rose-100 dark:bg-rose-900/30 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300 shadow-sm' : 'border-transparent hover:bg-white/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}
                           >
                             <ArrowDownCircle size={14} /> Forçar Despesas
                           </button>
                        </div>
                      </div>
                      
                      <label className={`
                        flex items-center justify-center gap-2 w-full md:w-auto px-6 py-3 rounded-lg cursor-pointer transition-colors
                        ${isImporting ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'}
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
                  </div>
               </div>
             </div>

             {/* Real-time Import Log */}
             {importLogs.length > 0 && (
                <div className="mt-6 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-lg animate-fade-in">
                  <div className="bg-slate-800 dark:bg-slate-950 p-3 flex justify-between items-center border-b border-slate-700">
                    <div className="flex items-center gap-2 text-slate-300 font-mono text-sm">
                      <Terminal size={16} />
                      <span className="font-bold">Console de Importação</span>
                    </div>
                    <button onClick={clearImportLogs} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-700 px-2 py-1 rounded">
                      <XCircle size={12} /> Limpar
                    </button>
                  </div>
                  <div className="bg-slate-900 dark:bg-black h-80 overflow-y-auto p-4 space-y-2 font-mono text-xs md:text-sm custom-scrollbar relative">
                     {importLogs.map((log) => (
                       <div key={log.id} className="flex gap-2">
                         <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                         <span className={`
                           ${log.type === 'info' ? 'text-blue-400' : ''}
                           ${log.type === 'success' ? 'text-emerald-400' : ''}
                           ${log.type === 'warning' ? 'text-amber-400' : ''}
                           ${log.type === 'error' ? 'text-rose-500 font-bold' : ''}
                           ${log.type === 'new' ? 'text-purple-400 font-bold' : ''}
                         `}>
                           {log.type === 'new' && <span className="mr-2 inline-block bg-purple-900/50 px-1 rounded text-[10px] border border-purple-700">NEW</span>}
                           {log.message}
                         </span>
                       </div>
                     ))}
                     <div ref={logsEndRef} />
                  </div>
                </div>
             )}
           </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-6">
             <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-xl border border-purple-100 dark:border-purple-800">
               <label className="block text-sm font-bold text-purple-900 dark:text-purple-300 mb-2">Gemini API Key (Google AI)</label>
               <div className="relative">
                 <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" size={18} />
                 <input 
                   type="password" 
                   className="w-full border border-purple-200 dark:border-purple-700 rounded-lg p-2.5 pl-10 focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" 
                   value={settings.geminiApiKey || ''} 
                   onChange={e => setSettings({...settings, geminiApiKey: e.target.value})} 
                   placeholder="Cole sua chave AIza..."
                 />
               </div>
               {/* Visual Indicator of Key Source */}
               <div className="mt-2 text-xs flex items-center gap-2">
                  {settings.geminiApiKey ? (
                     <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                       <CheckCircle size={12} /> Usando chave personalizada (substitui ambiente)
                     </span>
                  ) : hasEnvKey ? (
                     <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                       <CheckCircle size={12} /> Usando chave do ambiente (.env/System)
                     </span>
                  ) : (
                     <span className="text-rose-500 font-medium flex items-center gap-1">
                       <AlertCircle size={12} /> Nenhuma chave detectada
                     </span>
                  )}
               </div>
             </div>

             <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-xl border border-emerald-100 dark:border-emerald-800">
               <div className="flex items-center gap-2 mb-4">
                 <Database className="text-emerald-600 dark:text-emerald-400" size={20} />
                 <h3 className="font-bold text-emerald-900 dark:text-emerald-300">Conexão Supabase</h3>
                 {isSupabaseConnected && <span className="text-xs bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">CONECTADO</span>}
               </div>
               
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-bold text-emerald-900 dark:text-emerald-300 mb-1">Project URL</label>
                   <input className="w-full border border-emerald-200 dark:border-emerald-700 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={settings.supabaseUrl || ''} onChange={e => setSettings({...settings, supabaseUrl: e.target.value})} placeholder="https://..." />
                 </div>
                 <div>
                   <label className="block text-sm font-bold text-emerald-900 dark:text-emerald-300 mb-1">API Key (anon/public)</label>
                   <input type="password" className="w-full border border-emerald-200 dark:border-emerald-700 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value={settings.supabaseKey || ''} onChange={e => setSettings({...settings, supabaseKey: e.target.value})} />
                 </div>
               </div>
             
               <div className="mt-6">
                 <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mb-2">Configuração do Banco de Dados (SQL)</p>
                 <div className="bg-slate-800 dark:bg-slate-950 text-slate-300 p-4 rounded-lg text-xs font-mono overflow-auto h-48 border border-slate-700">
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
        
        <div className="mt-8 flex justify-end pt-6 border-t border-slate-100 dark:border-slate-800">
          <button onClick={handleSave} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-blue-900/50 transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
            <Save size={20} /> Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};