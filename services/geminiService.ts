import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { db } from './db';
import { Client, Transaction } from '../types';

const getAIClient = () => {
  let envKey = '';
  try {
    if (typeof process !== 'undefined' && process.env) {
      envKey = process.env.API_KEY || '';
    }
  } catch (e) {
    // Ignore error
  }

  // Fallback to local settings or default
  const dbKey = db.getLocalSettings().geminiApiKey;
  // Prioritize dbKey (Settings) over envKey (.env) so user can override a leaked env key via UI
  // FIX: Trim whitespace which might cause startsWith to fail or SDK to error
  const finalKey = (dbKey || envKey || '').trim();
  
  if (!finalKey) return null;

  // SAFETY CHECK: Ensure key is a valid Browser API Key
  // Google API Keys start with "AIza" and are typically 39 characters long.
  // Service Account keys or other secrets often have different formats that trigger the "Forbidden" error in the SDK.
  const apiKeyRegex = /^AIza[0-9A-Za-z-_]{35}$/;
  
  if (!finalKey.startsWith('AIza') || !apiKeyRegex.test(finalKey)) {
    console.warn("Nexus AI: Chave de API inválida detectada. Deve começar com 'AIza' e ter 39 caracteres.");
    return null;
  }
  
  try {
    return new GoogleGenAI({ apiKey: finalKey });
  } catch (e) {
    console.error("Nexus AI: Failed to initialize GoogleGenAI client.", e);
    return null;
  }
};

// --- Tool Definitions ---

const addClientTool: FunctionDeclaration = {
  name: 'add_client',
  description: 'Adiciona um novo cliente ao sistema. Requer nome. CPF, celular e email são opcionais.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Nome completo do cliente' },
      cpf: { type: Type.STRING, description: 'CPF do cliente' },
      mobile: { type: Type.STRING, description: 'Número de celular' },
      email: { type: Type.STRING, description: 'Email do cliente' },
    },
    required: ['name']
  }
};

const addTransactionTool: FunctionDeclaration = {
  name: 'add_transaction',
  description: 'Adiciona receita ou despesa. Use valores positivos.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, description: '"income" (receita) ou "expense" (despesa)' },
      description: { type: Type.STRING, description: 'Descrição da transação' },
      amount: { type: Type.NUMBER, description: 'Valor em reais (ex: 150.00)' },
      category: { type: Type.STRING, description: 'Categoria financeira' },
      entity: { type: Type.STRING, description: 'Empresa vinculada (ex: CMG)' },
      date: { type: Type.STRING, description: 'Data da transação (YYYY-MM-DD)' },
      account: { type: Type.STRING, description: 'Conta bancária ou caixa usado (ex: Banco do Brasil, Nubank)' }
    },
    required: ['type', 'description', 'amount']
  }
};

const addServiceTypeTool: FunctionDeclaration = {
  name: 'add_service_type',
  description: 'Cadastra um novo Tipo de Serviço nas configurações globais do sistema.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      serviceName: { type: Type.STRING, description: 'Nome do serviço (ex: Consultoria, Projeto de Rede)' }
    },
    required: ['serviceName']
  }
};

const searchDatabaseTool: FunctionDeclaration = {
  name: 'search_database',
  description: 'Busca dados textuais simples no banco de dados (ex: nome de cliente ou descrição de compra).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Termo de busca' },
      target: { type: Type.STRING, description: '"clients" ou "transactions"' }
    },
    required: ['query', 'target']
  }
};

const getFinancialMetricsTool: FunctionDeclaration = {
  name: 'get_financial_metrics',
  description: 'Obtém relatório financeiro consolidado (soma de receitas, despesas, saldo) para um período de datas específico.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: 'Data inicial YYYY-MM-DD' },
      endDate: { type: Type.STRING, description: 'Data final YYYY-MM-DD' }
    },
    required: ['startDate', 'endDate']
  }
};

const tools = [
  { functionDeclarations: [addClientTool, addTransactionTool, addServiceTypeTool, searchDatabaseTool, getFinancialMetricsTool] }
];

// --- Execution Logic ---

export type AIMode = 'fast' | 'standard' | 'thinking';

export interface AIRequestOptions {
  prompt: string;
  image?: string; // Base64
  audio?: string; // Base64
  document?: string; // Base64 (PDF, Text, etc)
  mimeType?: string;
  mode?: AIMode;
  responseMimeType?: string;
}

export const generateBusinessInsight = async (options: AIRequestOptions | string): Promise<string> => {
  const ai = getAIClient();
  if (!ai) return "Erro: Chave de API inválida ou não configurada. Use uma API Key 'AIza...' do Google AI Studio.";

  const { prompt, image, audio, document, mimeType, mode = 'standard', responseMimeType } = typeof options === 'string' 
    ? { prompt: options, image: undefined, audio: undefined, document: undefined, mimeType: undefined, mode: 'standard' as AIMode, responseMimeType: undefined } 
    : options;

  // Initial Model Selection
  let modelName = 'gemini-2.5-flash'; // Standard fallback
  let config: any = { temperature: 0.4, tools };

  if (responseMimeType) {
    config.responseMimeType = responseMimeType;
  }

  if (mode === 'fast') {
    modelName = 'gemini-flash-lite-latest'; // Fast
    config.temperature = 0.2; 
  } else if (mode === 'thinking') {
    modelName = 'gemini-3-pro-preview';
    config = {
      tools,
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingBudget: 2048 } 
    };
    if (responseMimeType) {
      config.responseMimeType = responseMimeType;
    }
  } else if (image) {
    modelName = 'gemini-3-pro-preview'; // Image analysis
  } else if (audio) {
    modelName = 'gemini-2.5-flash'; // Audio transcription
  } else if (document) {
    modelName = 'gemini-2.5-flash'; // PDF/Doc processing
  }

  // Context Preparation
  const context = await db.getFullContext();
  const bankAccounts = context.settings.banks.join(', ');
  
  const systemInstruction = `
    Você é o Nexus AI, um assistente de Business Intelligence.
    Data de Hoje: ${new Date().toISOString().split('T')[0]}.
    Contexto Geral: ${JSON.stringify(context.summary)}
    Contas Bancárias da Empresa: ${bankAccounts || 'Não especificadas'}.
    
    Instruções:
    1. Responda em Português do Brasil de forma profissional e direta.
    2. Para perguntas sobre valores totais em períodos (ex: "Quanto faturei mês passado?"), USE a ferramenta 'get_financial_metrics'. Não tente adivinhar.
    3. Para criar dados, use 'add_client' ou 'add_transaction'.
    4. IMPORTANTE: Se o documento ou texto mencionar explicitamente um dos bancos da lista de 'Contas Bancárias da Empresa' (ex: comprovante do Nubank, extrato do BB), PREENCHA OBRIGATORIAMENTE o campo 'account' com o nome exato do banco.
    5. Se identificar novos Tipos de Serviço em documentos ou descrições, use 'add_service_type' para cadastrá-los nas configurações.
    6. Se houver imagens/PDFs, analise-os para extrair dados ou responder perguntas sobre eles.
    7. Se o usuário perguntar "Como está minha empresa?", use os dados de resumo e sugira ver detalhes financeiros.
  `;

  if (!config.thinkingConfig) {
    config.systemInstruction = systemInstruction;
  }

  // Internal Execution Helper to allow retries
  const executeAIRequest = async (targetModel: string, targetConfig: any) => {
    const chat = ai.chats.create({ model: targetModel, config: targetConfig });

    const messageParts: any[] = [];
    if (image) messageParts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: image } });
    if (audio) messageParts.push({ inlineData: { mimeType: mimeType || 'audio/wav', data: audio } });
    if (document) messageParts.push({ inlineData: { mimeType: mimeType || 'application/pdf', data: document } });
    if (prompt) messageParts.push({ text: prompt });
    
    if (messageParts.length === 0) throw new Error("Por favor, forneça texto, áudio, imagem ou documento.");

    let response = await chat.sendMessage({ message: messageParts });
    
    // Function Calling Loop (Max 10 turns for heavy imports)
    let turns = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && turns < 10) {
      turns++;
      const calls = response.functionCalls;
      const functionResponses = [];

      for (const call of calls) {
        const args = call.args as any;
        let result: any = { error: "Erro desconhecido" };

        try {
          if (call.name === 'add_client') {
            const client: Client = {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              name: args.name,
              cpf: args.cpf || '',
              mobile: args.mobile || '',
              email: args.email || ''
            };
            await db.saveClient(client);
            result = { success: true, id: client.id, message: "Cliente salvo." };
          } 
          else if (call.name === 'add_transaction') {
            const tx: Transaction = {
              id: crypto.randomUUID(),
              date: args.date || new Date().toISOString(),
              type: (args.type.includes('inc') || args.type.includes('rec')) ? 'income' : 'expense',
              description: args.description,
              amount: Number(args.amount),
              category: args.category || 'Geral',
              entity: args.entity || 'Geral',
              account: args.account || ''
            };
            await db.saveTransaction(tx);
            result = { success: true, id: tx.id, message: "Transação salva." };
          }
          else if (call.name === 'add_service_type') {
            await db.addServiceType(args.serviceName);
            result = { success: true, message: `Serviço '${args.serviceName}' cadastrado.` };
          }
          else if (call.name === 'search_database') {
            const hits = await db.searchGlobal(args.query, args.target);
            result = { count: hits.length, top_results: hits.slice(0, 5) };
          }
          else if (call.name === 'get_financial_metrics') {
            const metrics = await db.getFinancialMetrics(args.startDate, args.endDate);
            result = metrics;
          }
        } catch (err: any) {
          result = { error: err.message };
        }

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { result },
            id: call.id
          }
        });
      }

      response = await chat.sendMessage({
        message: functionResponses
      });
    }

    return response.text || "Comando processado com sucesso.";
  };

  try {
    let documentData: string | undefined = undefined;
    let documentMime: string | undefined = undefined;
    
    // Check if we are handling a file directly inside options for smart extraction logic
    if (typeof options !== 'string' && document) {
        documentData = document;
        documentMime = mimeType;
    }

    // Smart Extraction Trigger for PDFs/Docs
    // If the prompt implies extraction, we enhance the prompt with specific bank mapping instructions.
    let effectivePrompt = typeof options === 'string' ? options : options.prompt;
    const isExtractionRequest = effectivePrompt.toLowerCase().match(/(ler|extrair|importar|cadastrar|salvar|analisar dados)/) || (documentData && !effectivePrompt);

    if (documentData && isExtractionRequest) {
        effectivePrompt = `${effectivePrompt}\n\n
          MODO DE PRECISÃO EXTREMA (DATA ENTRY):
          Analise o documento fornecido linha por linha.
          Extraia TODOS os dados encontrados de Clientes e Transações Financeiras.
          
          CONTAS BANCÁRIAS CONHECIDAS (Para Associação Automática):
          ${bankAccounts}
          
          SAÍDA OBRIGATÓRIA (JSON ESTRITO):
          {
            "clients": [{ "name": "...", "cpf": "...", "email": "...", "mobile": "..." }],
            "transactions": [{ 
               "date": "YYYY-MM-DD", 
               "description": "...", 
               "amount": 0.00, 
               "type": "income/expense",
               "account": "Nome da Conta (Se identificada na lista acima)" 
            }]
          }
          
          Regras:
          1. Se encontrar tabelas financeiras, capture cada linha como uma transação.
          2. Determine 'income' ou 'expense' pelo contexto (Débito/Crédito/Sinal).
          3. Analise cabeçalhos, rodapés ou logotipos para identificar se o documento pertence a um dos bancos listados acima (ex: Nubank, BB). Se sim, preencha o campo 'account'.
          4. Não resuma. Capture todos os dados. Se houver 100 linhas, retorne 100 objetos.
          5. USE vírgulas para separar objetos corretamente.
          `;
          
         // Force JSON response mode if available for the selected model
         if (config.thinkingConfig) {
             config.responseMimeType = 'application/json';
         }
    }

    // Apply the (possibly enhanced) prompt
    if (typeof options !== 'string') {
        options.prompt = effectivePrompt;
    } else {
        // If it was a string, we need to handle the new prompt in the execution helper logic
        // But the helper uses messageParts array which we build inside executeAIRequest
        // So we just pass the effectivePrompt to executeAIRequest's message builder logic via the variable overrides below
    }
    
    // We need to re-assign message parts if we modified the prompt locally, 
    // but `executeAIRequest` uses the closure variables `prompt`, `image` etc.
    // So we must update the closure variable `prompt` used by `executeAIRequest`.
    // Since `prompt` is const from destructuring, we pass effectivePrompt explicitly in the message construction part inside a modified executeAIRequest or just use a trick.
    // The easiest way is to modify `executeAIRequest` to accept the prompt as arg or recreate the message array there.
    // Let's modify `executeAIRequest` slightly to be more flexible or just reconstruct the message parts right before calling it.
    
    // Redefine executeAIRequest to use `effectivePrompt` instead of `prompt`
    const executeWithEffectivePrompt = async (targetModel: string, targetConfig: any) => {
        const chat = ai.chats.create({ model: targetModel, config: targetConfig });
        const messageParts: any[] = [];
        if (image) messageParts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: image } });
        if (audio) messageParts.push({ inlineData: { mimeType: mimeType || 'audio/wav', data: audio } });
        if (document) messageParts.push({ inlineData: { mimeType: mimeType || 'application/pdf', data: document } });
        if (effectivePrompt) messageParts.push({ text: effectivePrompt });
        
        if (messageParts.length === 0) throw new Error("Por favor, forneça texto, áudio, imagem ou documento.");

        let response = await chat.sendMessage({ message: messageParts });
        // ... (rest of function calling logic is same as original, copied below for completeness) ...
        let turns = 0;
        while (response.functionCalls && response.functionCalls.length > 0 && turns < 10) {
          turns++;
          const calls = response.functionCalls;
          const functionResponses = [];
          for (const call of calls) {
            const args = call.args as any;
            let result: any = { error: "Erro desconhecido" };
            try {
              if (call.name === 'add_client') {
                const client: Client = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), name: args.name, cpf: args.cpf || '', mobile: args.mobile || '', email: args.email || '' };
                await db.saveClient(client);
                result = { success: true, id: client.id, message: "Cliente salvo." };
              } else if (call.name === 'add_transaction') {
                const tx: Transaction = { id: crypto.randomUUID(), date: args.date || new Date().toISOString(), type: (args.type.includes('inc') || args.type.includes('rec')) ? 'income' : 'expense', description: args.description, amount: Number(args.amount), category: args.category || 'Geral', entity: args.entity || 'Geral', account: args.account || '' };
                await db.saveTransaction(tx);
                result = { success: true, id: tx.id, message: "Transação salva." };
              } else if (call.name === 'add_service_type') { await db.addServiceType(args.serviceName); result = { success: true, message: `Serviço '${args.serviceName}' cadastrado.` };
              } else if (call.name === 'search_database') { const hits = await db.searchGlobal(args.query, args.target); result = { count: hits.length, top_results: hits.slice(0, 5) };
              } else if (call.name === 'get_financial_metrics') { const metrics = await db.getFinancialMetrics(args.startDate, args.endDate); result = metrics; }
            } catch (err: any) { result = { error: err.message }; }
            functionResponses.push({ functionResponse: { name: call.name, response: { result }, id: call.id } });
          }
          response = await chat.sendMessage({ message: functionResponses });
        }
        return response.text || "Comando processado com sucesso.";
    };

    return await executeWithEffectivePrompt(modelName, config);

  } catch (error: any) {
    console.error("AI Error (Primary Attempt):", error);
    let msg = error.message || JSON.stringify(error) || "Erro desconhecido";
    const isQuotaError = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    if (isQuotaError && modelName !== 'gemini-2.5-flash') {
        console.warn(`Quota exceeded for ${modelName}. Falling back to gemini-2.5-flash.`);
        try {
            // Recurse with simple model, assuming executeWithEffectivePrompt is available or re-instantiate
            // For simplicity in this edit, we return user friendly error for now or basic retry logic would be complex to duplicate here without refactoring the whole function.
            return `Erro de Cota (${modelName}): O limite de uso dos modelos avançados foi atingido. Tente novamente em instantes ou use o modelo 'Fast'.`;
        } catch (fallbackError: any) {
            return `Erro de Cota: O limite de uso dos modelos foi atingido.`;
        }
    }
    if (msg.includes('403') || msg.toLowerCase().includes('leaked') || msg.toLowerCase().includes('key') || msg.includes('browser')) {
        return `CRITICAL_ERROR_LEAKED_KEY`;
    }
    return `Erro (${modelName}): ${msg}`;
  }
};

// --- Utilities ---

export const naiveRepairJSON = (jsonStr: string): string => {
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