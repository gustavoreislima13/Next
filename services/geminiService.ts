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
  const finalKey = dbKey || envKey || '';
  
  if (!finalKey) return null;

  // SAFETY CHECK: Ensure key is a valid Browser API Key (starts with AIza)
  // The SDK throws "Forbidden use of secret API key" if a Service Account key is used in browser.
  if (!finalKey.startsWith('AIza')) {
    console.warn("Nexus AI: Chave de API inválida detectada. Use uma chave do Google AI Studio (começa com AIza).");
    return null;
  }
  
  return new GoogleGenAI({ apiKey: finalKey });
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
      date: { type: Type.STRING, description: 'Data da transação (YYYY-MM-DD)' }
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
  const systemInstruction = `
    Você é o Nexus AI, um assistente de Business Intelligence.
    Data de Hoje: ${new Date().toISOString().split('T')[0]}.
    Contexto Geral: ${JSON.stringify(context.summary)}
    
    Instruções:
    1. Responda em Português do Brasil de forma profissional e direta.
    2. Para perguntas sobre valores totais em períodos (ex: "Quanto faturei mês passado?"), USE a ferramenta 'get_financial_metrics'. Não tente adivinhar.
    3. Para criar dados, use 'add_client' ou 'add_transaction'.
    4. Se identificar novos Tipos de Serviço em documentos ou descrições, use 'add_service_type' para cadastrá-los nas configurações.
    5. Se houver imagens/PDFs, analise-os para extrair dados ou responder perguntas sobre eles.
    6. Se o usuário perguntar "Como está minha empresa?", use os dados de resumo e sugira ver detalhes financeiros.
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
              entity: args.entity || 'Geral'
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
    return await executeAIRequest(modelName, config);
  } catch (error: any) {
    console.error("AI Error (Primary Attempt):", error);
    let msg = error.message || JSON.stringify(error) || "Erro desconhecido";
    
    // Check for Quota/Rate Limit Errors (429)
    const isQuotaError = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    
    // Fallback Logic: If 3-pro fails with quota, try 2.5-flash
    if (isQuotaError && modelName !== 'gemini-2.5-flash') {
        console.warn(`Quota exceeded for ${modelName}. Falling back to gemini-2.5-flash.`);
        try {
            return await executeAIRequest('gemini-2.5-flash', config);
        } catch (fallbackError: any) {
            console.error("AI Error (Fallback Attempt):", fallbackError);
            // If fallback also fails, return a quota error message
            return `Erro de Cota: O limite de uso dos modelos foi atingido. Aguarde alguns instantes.`;
        }
    }

    // Parsing error message for specific Critical Key issues
    if (msg.includes('403') || msg.toLowerCase().includes('leaked') || msg.toLowerCase().includes('key') || msg.includes('browser')) {
        return `CRITICAL_ERROR_LEAKED_KEY`;
    }

    return `Erro (${modelName}): ${msg}`;
  }
};