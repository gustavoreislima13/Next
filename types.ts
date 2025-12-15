export interface Client {
  id: string;
  name: string;
  cpf: string;
  mobile: string;
  email: string;
  createdAt: string;
  // Campos de Triagem
  status?: 'Lead' | 'Em Negociação' | 'Fechado' | 'Perdido';
  triageNotes?: string;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  date: string;
  entity: string; // 'CMG' | 'Everton Guerra'
  category: string;
  account?: string; // Novo campo: Conta Bancária / Caixa
  observation?: string; 
  // Specific to Income
  clientId?: string;
  serviceType?: string;
  consultant?: string;
  // Specific to Expense
  supplier?: string;
  // Attachments
  attachmentIds?: string[];
}

export interface StickyNote {
  id: string;
  title: string;
  content: string;
  color: string; // Tailwind bg class
  x: number;
  y: number;
}

export interface StoredFile {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'video' | 'other';
  size: string;
  date: string;
  associatedClient?: string;
  associatedTransactionId?: string; // Novo campo para vincular ao financeiro
}

export interface UserProfile {
  name: string;
  role: string;
  avatarUrl: string;
}

// New Interface for Employee Management
export interface User {
  id: string;
  name: string;
  email: string;
  role: string; // 'Admin' | 'Vendedor' | 'Financeiro'
  avatarUrl?: string;
  password?: string; // Simple check for demo
  createdAt: string;
}

// New Interface for Audit Logs
export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: 'create' | 'update' | 'delete' | 'login';
  target: 'Client' | 'Transaction' | 'File' | 'Note' | 'User' | 'System';
  details: string;
  timestamp: string;
}

export interface AppSettings {
  companyName: string;
  cnpj: string;
  entities: string[];
  consultants: string[];
  banks: string[];
  serviceTypes: string[];
  categories: string[];
  // API Configurations
  geminiApiKey?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface PricingData {
  cost: number;
  fixedExpenses: number;
  taxRate: number;
  desiredMargin: number;
}