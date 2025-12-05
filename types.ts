export interface Client {
  id: string;
  name: string;
  cpf: string;
  mobile: string;
  email: string;
  createdAt: string;
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
  observation?: string; // Novo campo
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