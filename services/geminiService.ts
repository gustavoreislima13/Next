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
  const finalKey = envKey || dbKey || '';
  
  if (!finalKey) return null;
  
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
    },
    required: ['type', 'description', 'amount']
  }
};

const searchDatabaseTool: FunctionDeclaration = {
  name: 'search_database',
  description: 'Busca dados no banco de dados (clientes ou transações).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Termo de busca' },
      target: { type: Type.STRING, description: '"clients" ou "transactions"' }
    },
    required: ['query', 'target']
  }
};

const tools = [
  { functionDeclarations: [addClientTool, addTransactionTool, searchDatabaseTool] }
];

// --- Execution Logic ---

export type AIMode = 'fast' | 'standard' | 'thinking';

export interface AIRequestOptions {
  prompt: string;
  image?: string; // Base64
  audio?: string; // Base64
  mimeType?: string;
  mode?: AIMode;
}

export const generateBusinessInsight = async (options: AIRequestOptions | string): Promise<string> => {
  const ai = getAIClient();
  if (!ai) return "Erro: Chave de API não configurada.";

  const { prompt, image, audio, mimeType, mode = 'standard' } = typeof options === 'string' 
    ? { prompt: options, image: undefined, audio: undefined, mimeType: undefined, mode: 'standard' as AIMode } 
    : options;

  // Model Selection
  let modelName = 'gemini-2.5-flash'; // Standard fallback
  let config: any = { temperature: 0.4, tools };

  if (mode === 'fast') {
    modelName = 'gemini-flash-lite-latest'; // Fast
    // Reduce temperature for stability in fast mode
    config.temperature = 0.2; 
  } else if (mode === 'thinking') {
    modelName = 'gemini-3-pro-preview';
    config = {
      tools,
      thinkingConfig: { thinkingBudget: 32768 } // Max thinking
    };
  } else if (image) {
    modelName = 'gemini-3-pro-preview'; // Image analysis
  } else if (audio) {
    modelName = 'gemini-2.5-flash'; // Audio transcription
  }

  // Context Preparation
  const context = await db.getFullContext();
  const systemInstruction = `
    Você é o Nexus AI. Hoje é ${new Date().toLocaleDateString('pt-BR')}.
    Contexto do ERP: ${JSON.stringify(context)}
    
    Instruções:
    1. Se houver imagem: Analise detalhes visuais (documentos, produtos).
    2. Se houver áudio: Transcreva e execute a intenção.
    3. Use as ferramentas (tools) para criar ou buscar dados se solicitado.
    4. Responda em Português do Brasil.
  `;

  if (!config.thinkingConfig) {
    config.systemInstruction = systemInstruction;
  }

  try {
    const chat = ai.chats.create({ model: modelName, config });

    const messageParts: any[] = [];
    if (image) messageParts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: image } });
    if (audio) messageParts.push({ inlineData: { mimeType: mimeType || 'audio/wav', data: audio } });
    if (prompt) messageParts.push({ text: prompt });
    if (messageParts.length === 0) return "Por favor, forneça texto, áudio ou imagem.";

    let response = await chat.sendMessage({ message: messageParts });
    
    // Function Calling Loop (Max 5 turns)
    let turns = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && turns < 5) {
      turns++;
      const call = response.functionCalls[0];
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
            date: new Date().toISOString(),
            type: (args.type.includes('inc') || args.type.includes('rec')) ? 'income' : 'expense',
            description: args.description,
            amount: Number(args.amount),
            category: args.category || 'Geral',
            entity: args.entity || 'Geral'
          };
          await db.saveTransaction(tx);
          result = { success: true, id: tx.id, message: "Transação salva." };
        }
        else if (call.name === 'search_database') {
          const hits = await db.searchGlobal(args.query, args.target);
          result = { count: hits.length, top_results: hits.slice(0, 5) };
        }
      } catch (err: any) {
        result = { error: err.message };
      }

      // Return result to model
      response = await chat.sendMessage({
        message: [{
          functionResponse: {
            name: call.name,
            response: { result },
            id: call.id
          }
        }]
      });
    }

    return response.text || "Comando processado.";

  } catch (error: any) {
    console.error("AI Error:", error);
    return `Erro (${modelName}): ${error.message}`;
  }
};