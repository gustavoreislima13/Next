import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client, Transaction, StickyNote, StoredFile, AppSettings, UserProfile, User, AuditLog } from '../types';

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
const DEFAULT_ADMIN: User = { id: 'admin', name: 'Administrador', email: 'admin@nexus.com', role: 'Admin', createdAt: new Date().toISOString() };

const KEYS = { 
  CLIENTS: 'n_clients', 
  TX: 'n_tx', 
  NOTES: 'n_notes', 
  FILES: 'n_files', 
  SET: 'n_set', 
  PROF: 'n_prof',
  USERS: 'n_users',
  LOGS: 'n_logs',
  SESSION: 'n_session'
};

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

  // --- Auth & Session ---
  getCurrentUser(): User | null {
    try { return JSON.parse(sessionStorage.getItem(KEYS.SESSION) || 'null'); } catch { return null; }
  }

  async login(userId: string): Promise<boolean> {
    const users = await this.getUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      sessionStorage.setItem(KEYS.SESSION, JSON.stringify(user));
      await this.logAction('login', 'User', `Usuário ${user.name} entrou no sistema.`);
      return true;
    }
    return false;
  }

  logout() {
    sessionStorage.removeItem(KEYS.SESSION);
  }

  // --- Audit Logs ---
  async logAction(action: AuditLog['action'], target: AuditLog['target'], details: string) {
    const currentUser = this.getCurrentUser() || { id: 'sys', name: 'Sistema' };
    const log: AuditLog = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action,
      target,
      details,
      timestamp: new Date().toISOString()
    };

    if (this.useSupabase) {
      // Assuming 'logs' table exists, otherwise fallback to local
      const { error } = await this.supabase!.from('logs').insert(log);
      if (error) console.warn("Log Supabase failed, saving local"); // Fallback
    }
    
    // Always keep a local copy for immediate display if needed, or if Supabase fails
    const list = this.getLocal<AuditLog[]>(KEYS.LOGS, []);
    list.unshift(log); // Prepend
    this.setLocal(KEYS.LOGS, list.slice(0, 100)); // Keep last 100 locally
  }

  async getLogs(): Promise<AuditLog[]> {
    if (this.useSupabase) {
       const { data, error } = await this.supabase!.from('logs').select('*').order('timestamp', { ascending: false }).limit(100);
       if (!error && data) return data;
    }
    return this.getLocal(KEYS.LOGS, []);
  }

  // --- User Management ---
  async getUsers(): Promise<User[]> {
    if (this.useSupabase) {
      const { data, error } = await this.supabase!.from('users').select('*');
      if (!error && data && data.length > 0) return data;
      // If table empty or error, fallthrough to check default admin logic
    }
    
    const localUsers = this.getLocal<User[]>(KEYS.USERS, []);
    if (localUsers.length === 0) {
      // Ensure at least admin exists
      return [DEFAULT_ADMIN];
    }
    return localUsers;
  }

  async saveUser(user: User) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('users').upsert(user);
      if (error) throw new Error(error.message);
    } else {
      const list = await this.getUsers();
      const idx = list.findIndex(u => u.id === user.id);
      if (idx >= 0) list[idx] = user; else list.push(user);
      this.setLocal(KEYS.USERS, list);
    }
    await this.logAction(user.createdAt === new Date().toISOString() ? 'create' : 'update', 'User', `Funcionário ${user.name} salvo/atualizado.`);
  }

  async deleteUser(id: string) {
    if (id === 'admin') throw new Error("Não é possível excluir o Administrador principal.");
    
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('users').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      const list = await this.getUsers();
      this.setLocal(KEYS.USERS, list.filter(u => u.id !== id));
    }
    await this.logAction('delete', 'User', `Funcionário ID ${id} removido.`);
  }

  // Settings
  getLocalSettings(): AppSettings {
    const s = this.getLocal<AppSettings>(KEYS.SET, DEFAULT_SETTINGS);
    if (!s.geminiApiKey && DEFAULT_SETTINGS.geminiApiKey) s.geminiApiKey = DEFAULT_SETTINGS.geminiApiKey;
    return s;
  }
  async getSettings() { return this.getLocalSettings(); }
  async updateSettings(s: AppSettings) { 
    this.setLocal(KEYS.SET, s); 
    this.initSupabase(); 
    await this.logAction('update', 'System', 'Configurações do sistema atualizadas.');
  }
  
  async addServiceType(serviceName: string) {
    const s = this.getLocalSettings();
    if (!s.serviceTypes.find(st => st.toLowerCase() === serviceName.toLowerCase())) {
      s.serviceTypes.push(serviceName);
      await this.updateSettings(s);
    }
  }

  getUserProfile() { return this.getLocal(KEYS.PROF, DEFAULT_PROFILE); }
  async saveUserProfile(p: UserProfile) { 
    this.setLocal(KEYS.PROF, p);
    // Update session user as well if applicable
    const current = this.getCurrentUser();
    if (current) {
        current.name = p.name;
        current.role = p.role;
        current.avatarUrl = p.avatarUrl;
        sessionStorage.setItem(KEYS.SESSION, JSON.stringify(current));
        // Also update the User Record
        await this.saveUser(current);
    }
  }
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
    const isNew = !c.id; // Logic check depends on context, assuming ID passed is new or existing
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('clients').upsert(c);
      if (error) throw new Error(error.message);
    } else {
      const list = this.getLocal<Client[]>(KEYS.CLIENTS, []);
      const idx = list.findIndex(x => x.id === c.id);
      if (idx >= 0) list[idx] = c; else list.push(c);
      this.setLocal(KEYS.CLIENTS, list);
    }
    await this.logAction('update', 'Client', `Cliente ${c.name} ${isNew ? 'criado' : 'atualizado'}.`);
  }
  async bulkUpsertClients(cs: Client[]) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('clients').upsert(cs);
      if (error) throw new Error(error.message);
    } else {
      const list = this.getLocal<Client[]>(KEYS.CLIENTS, []);
      const map = new Map(list.map(c => [c.id, c]));
      cs.forEach(c => map.set(c.id, c));
      this.setLocal(KEYS.CLIENTS, Array.from(map.values()));
    }
    await this.logAction('create', 'Client', `Importação em massa: ${cs.length} clientes.`);
  }
  async deleteClient(id: string) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('clients').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      this.setLocal(KEYS.CLIENTS, this.getLocal<Client[]>(KEYS.CLIENTS, []).filter(x => x.id !== id));
    }
    await this.logAction('delete', 'Client', `Cliente ID ${id} excluído.`);
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
    await this.logAction('update', 'Transaction', `${t.type === 'income' ? 'Receita' : 'Despesa'} de R$ ${t.amount} registrada.`);
  }
  async bulkUpsertTransactions(ts: Transaction[]) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('transactions').upsert(ts);
      if (error) throw new Error(error.message);
    } else {
      const list = this.getLocal<Transaction[]>(KEYS.TX, []);
      const map = new Map(list.map(t => [t.id, t]));
      ts.forEach(t => map.set(t.id, t));
      this.setLocal(KEYS.TX, Array.from(map.values()));
    }
    await this.logAction('create', 'Transaction', `Importação em massa: ${ts.length} transações.`);
  }
  async deleteTransaction(id: string) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('transactions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      this.setLocal(KEYS.TX, this.getLocal<Transaction[]>(KEYS.TX, []).filter(x => x.id !== id));
    }
    await this.logAction('delete', 'Transaction', `Transação ID ${id} excluída.`);
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
    await this.logAction('create', 'File', `Arquivo ${f.name} adicionado.`);
  }
  
  async updateFile(f: StoredFile) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('files').upsert(f);
      if (error) throw new Error(error.message);
    } else {
      const list = this.getLocal<StoredFile[]>(KEYS.FILES, []);
      const idx = list.findIndex(x => x.id === f.id);
      if (idx >= 0) {
        list[idx] = f;
        this.setLocal(KEYS.FILES, list);
      }
    }
    await this.logAction('update', 'File', `Arquivo ${f.name} atualizado.`);
  }

  async deleteFile(id: string) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('files').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      this.setLocal(KEYS.FILES, this.getLocal<StoredFile[]>(KEYS.FILES, []).filter(x => x.id !== id));
    }
    await this.logAction('delete', 'File', `Arquivo ID ${id} excluído.`);
  }

  // Search & Analysis
  async searchGlobal(q: string, target: 'clients' | 'transactions') {
    const term = q.toLowerCase();
    if (target === 'clients') {
      const list = await this.getClients();
      return list.filter(c => c.name.toLowerCase().includes(term) || c.cpf.includes(term));
    }
    const list = await this.getTransactions();
    return list.filter(t => t.description.toLowerCase().includes(term));
  }

  async getFinancialMetrics(startDate: string, endDate: string) {
    const txs = await this.getTransactions();
    // Filter
    const filtered = txs.filter(t => t.date >= startDate && t.date <= endDate);
    
    const income = filtered.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = filtered.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    
    return {
      period: `${startDate} até ${endDate}`,
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      transactionCount: filtered.length,
      details: filtered.slice(0, 10) // Limit details for token context
    };
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