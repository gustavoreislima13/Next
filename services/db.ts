import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client, Transaction, StickyNote, StoredFile, AppSettings, UserProfile } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'Nexus Enterprise',
  cnpj: '00.000.000/0001-91',
  entities: ['CMG', 'Everton Guerra'],
  consultants: ['João Silva', 'Maria Souza'],
  banks: ['Banco do Brasil', 'Nubank'],
  serviceTypes: ['Consultoria', 'Projeto'],
  categories: ['Operacional', 'Marketing', 'Pessoal'],
  geminiApiKey: 'AIzaSyBqqmoHa1fjNxw9YpopcHoVABCb64iC1TM',
  supabaseUrl: 'https://qearqffblyeqnmgwgfqa.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlYXJxZmZibHllcW5tZ3dnZnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTI2OTMsImV4cCI6MjA4MDUyODY5M30.qAoAMB1WUku_QPTEPLiu5a-m7kIoRRb6UEuYH1zIhBw'
};

const DEFAULT_PROFILE: UserProfile = { name: 'Admin', role: 'Gerente', avatarUrl: '' };
const KEYS = { CLIENTS: 'n_clients', TX: 'n_tx', NOTES: 'n_notes', FILES: 'n_files', SET: 'n_set', PROF: 'n_prof' };

class DatabaseService {
  private supabase: SupabaseClient | null = null;
  private useSupabase: boolean = false;

  constructor() { this.initSupabase(); }

  private initSupabase() {
    const s = this.getLocalSettings();
    const url = s.supabaseUrl || DEFAULT_SETTINGS.supabaseUrl;
    const key = s.supabaseKey || DEFAULT_SETTINGS.supabaseKey;
    if (url && key) {
      try {
        this.supabase = createClient(url, key);
        this.useSupabase = true;
      } catch (e) { this.useSupabase = false; }
    }
  }

  // Local Helpers
  private getLocal<T>(key: string, def: T): T {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || def; } catch { return def; }
  }
  private setLocal<T>(key: string, data: T) { localStorage.setItem(key, JSON.stringify(data)); }

  // Settings
  getLocalSettings(): AppSettings {
    const s = this.getLocal<AppSettings>(KEYS.SET, DEFAULT_SETTINGS);
    if (!s.geminiApiKey && DEFAULT_SETTINGS.geminiApiKey) s.geminiApiKey = DEFAULT_SETTINGS.geminiApiKey;
    return s;
  }
  async getSettings() { return this.getLocalSettings(); }
  async updateSettings(s: AppSettings) { this.setLocal(KEYS.SET, s); this.initSupabase(); }
  getUserProfile() { return this.getLocal(KEYS.PROF, DEFAULT_PROFILE); }
  async saveUserProfile(p: UserProfile) { this.setLocal(KEYS.PROF, p); }
  isSupabaseConfigured() { return this.useSupabase; }

  // Realtime
  subscribe(table: string, cb: () => void) {
    if (this.useSupabase && this.supabase) {
      const ch = this.supabase.channel(`public:${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, cb)
        .subscribe();
      return { unsubscribe: () => { this.supabase?.removeChannel(ch); } };
    }
    return null;
  }

  // Clients
  async getClients(): Promise<Client[]> {
    if (this.useSupabase) {
      const { data, error } = await this.supabase!.from('clients').select('*');
      if (error) { console.error('Supabase getClients error:', JSON.stringify(error)); return []; }
      return data || [];
    }
    return this.getLocal(KEYS.CLIENTS, []);
  }
  async saveClient(c: Client) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('clients').upsert(c);
      if (error) throw new Error(error.message);
    } else {
      const list = this.getLocal<Client[]>(KEYS.CLIENTS, []);
      const idx = list.findIndex(x => x.id === c.id);
      if (idx >= 0) list[idx] = c; else list.push(c);
      this.setLocal(KEYS.CLIENTS, list);
    }
  }
  async bulkUpsertClients(cs: Client[]) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('clients').upsert(cs);
      if (error) throw new Error(error.message);
    }
  }
  async deleteClient(id: string) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('clients').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      this.setLocal(KEYS.CLIENTS, this.getLocal<Client[]>(KEYS.CLIENTS, []).filter(x => x.id !== id));
    }
  }

  // Transactions
  async getTransactions(): Promise<Transaction[]> {
    if (this.useSupabase) {
      const { data, error } = await this.supabase!.from('transactions').select('*');
      if (error) { console.error('Supabase getTransactions error:', JSON.stringify(error)); return []; }
      return (data || []).map(t => ({ ...t, amount: Number(t.amount) }));
    }
    return this.getLocal(KEYS.TX, []);
  }
  async saveTransaction(t: Transaction) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('transactions').upsert(t);
      if (error) {
        console.error("Save Tx Error:", JSON.stringify(error));
        // User friendly error for schema mismatch
        if (error.message && (error.message.includes('attachmentIds') || error.message.includes('schema'))) {
          throw new Error("Erro de Banco de Dados: Colunas faltando (attachmentIds). Vá em Configurações > Integrações e execute o SQL de atualização.");
        }
        throw new Error(error.message);
      }
    } else {
      const list = this.getLocal<Transaction[]>(KEYS.TX, []);
      const idx = list.findIndex(x => x.id === t.id);
      if (idx >= 0) list[idx] = t; else list.push(t);
      this.setLocal(KEYS.TX, list);
    }
  }
  async bulkUpsertTransactions(ts: Transaction[]) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('transactions').upsert(ts);
      if (error) throw new Error(error.message);
    }
  }
  async deleteTransaction(id: string) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('transactions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      this.setLocal(KEYS.TX, this.getLocal<Transaction[]>(KEYS.TX, []).filter(x => x.id !== id));
    }
  }

  // Notes & Files
  async getNotes(): Promise<StickyNote[]> {
    if (this.useSupabase) { 
      const { data, error } = await this.supabase!.from('notes').select('*'); 
      if (error) return [];
      return data || []; 
    }
    return this.getLocal(KEYS.NOTES, []);
  }
  async saveNote(n: StickyNote) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('notes').upsert(n);
      if (error) throw new Error(error.message);
    } else {
      const list = this.getLocal<StickyNote[]>(KEYS.NOTES, []);
      const idx = list.findIndex(x => x.id === n.id);
      if (idx >= 0) list[idx] = n; else list.push(n);
      this.setLocal(KEYS.NOTES, list);
    }
  }
  async deleteNote(id: string) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('notes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      this.setLocal(KEYS.NOTES, this.getLocal<StickyNote[]>(KEYS.NOTES, []).filter(x => x.id !== id));
    }
  }

  async getFiles(): Promise<StoredFile[]> {
    if (this.useSupabase) { 
      const { data, error } = await this.supabase!.from('files').select('*'); 
      if (error) return [];
      return data || []; 
    }
    return this.getLocal(KEYS.FILES, []);
  }
  async addFile(f: StoredFile) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('files').upsert(f);
      if (error) {
        console.error("Save File Error:", JSON.stringify(error));
         if (error.message && (error.message.includes('associatedClient') || error.message.includes('schema'))) {
          throw new Error("Erro de Banco de Dados: Coluna faltando (associatedClient). Vá em Configurações > Integrações e execute o SQL de atualização.");
        }
        throw new Error(error.message);
      }
    } else {
       const list = this.getLocal<StoredFile[]>(KEYS.FILES, []);
       list.unshift(f);
       this.setLocal(KEYS.FILES, list);
    }
  }

  // Search
  async searchGlobal(q: string, target: 'clients' | 'transactions') {
    const term = q.toLowerCase();
    if (target === 'clients') {
      const list = await this.getClients();
      return list.filter(c => c.name.toLowerCase().includes(term) || c.cpf.includes(term));
    }
    const list = await this.getTransactions();
    return list.filter(t => t.description.toLowerCase().includes(term));
  }

  async getFullContext() {
    const clients = await this.getClients();
    const txs = await this.getTransactions();
    return {
       summary: { 
         totalClients: clients.length, 
         txCount: txs.length, 
         balance: txs.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0) 
       },
       recent: txs.slice(0, 10),
       settings: this.getLocalSettings()
    };
  }
}

export const db = new DatabaseService();