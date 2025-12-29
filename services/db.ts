import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client, Transaction, StickyNote, StoredFile, AppSettings, UserProfile, User, AuditLog } from '../types';

// --- CONFIGURAÇÃO HARDCODED (FIXA NO CÓDIGO) ---
// Edite os valores abaixo. Eles serão os padrões sempre que o app carregar.
const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'Nexus Enterprise', // Digite o nome da sua empresa aqui
  cnpj: '00.000.000/0001-91',      // Digite o CNPJ aqui
  entities: ['Matriz', 'Filial SP', 'Filial RJ'], // Suas empresas/entidades
  consultants: ['Vendedor 1', 'Vendedor 2'],
  banks: ['Banco do Brasil', 'Nubank', 'Caixa', 'Santander', 'Itaú', 'Inter', 'Cofre'], // Seus bancos
  serviceTypes: ['Consultoria', 'Implementação', 'Venda de Produto', 'Manutenção'],
  categories: ['Operacional', 'Marketing', 'Pessoal', 'Impostos', 'Folha de Pagamento', 'Fornecedores'],
  
  // --- CHAVES DE API (COLE SUAS CHAVES AQUI PARA FICAR FIXO) ---
  geminiApiKey: 'AIzaSyAhh5XOBT3lLyqBcU3PpDYKeEJbrD1BzZo', 
  supabaseUrl: 'https://qearqffblyeqnmgwgfqa.supabase.co',  
  supabaseKey: 'sb_publishable_DDuT-LO8-7wn-wH4xHEVQQ_SBqyMtQR',  
  
  // --- WHATSAPP API (Opcional - Ex: Z-API, Evolution, UltraMsg) ---
  whatsappApiUrl: '', 
  whatsappApiToken: ''
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
    // We prioritize the Hardcoded DEFAULT_SETTINGS first if they exist in code
    // Then we look at LocalSettings (which might be older)
    // Then Env variables.
    
    // However, to ensure "Source Code" implies truth, we will merge Default into Local on load
    // This logic ensures if you change the code above, it reflects in the app immediately.
    const s = this.getLocalSettings();
    
    // Support Environment Variables (Vite standard)
    const envSupabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const envSupabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

    // Logic: Code > Env > Local Storage (Standard fallback)
    const url = (DEFAULT_SETTINGS.supabaseUrl || envSupabaseUrl || s.supabaseUrl || '').trim();
    const key = (DEFAULT_SETTINGS.supabaseKey || envSupabaseKey || s.supabaseKey || '').trim();

    if (url && key) {
      try {
        // Strict URL Validation to prevent "Failed to fetch" on garbage inputs
        new URL(url); 
        if (!url.startsWith('http')) throw new Error('Invalid protocol');
        
        this.supabase = createClient(url, key);
        this.useSupabase = true;
      } catch (e) {
        console.warn("Nexus DB: Failed to init Supabase client (invalid URL/Key). Using local storage.");
        this.useSupabase = false; 
      }
    } else {
      this.useSupabase = false;
    }
  }

  // Check if configured via Environment Variables (Secure Mode)
  public isEnvSupabaseConfigured(): boolean {
    return !!((import.meta as any).env?.VITE_SUPABASE_URL && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY);
  }

  // Self-healing mechanism: If Supabase rejects the key, disable it and fallback to local
  private handleSupabaseError(error: any): boolean {
    // Convert to string to catch object-based errors
    const msg = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
    
    // Check for specific API Key errors (invalid key, format, or unauthorized)
    // Also catch "Failed to fetch" which indicates network issues or invalid CORS/DNS
    if (
      msg.includes('Invalid API key') || 
      msg.includes('JWT') || 
      msg.includes('service_role') || 
      msg.includes('401') || 
      msg.includes('403') ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Load failed')
    ) {
        console.warn("Nexus DB: Supabase connection failed (Auth or Network). Switching to Local Storage mode.");
        this.useSupabase = false;
        this.supabase = null;
        return true; // Indicates we handled it by downgrading
    }
    return false;
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
      const { error } = await this.supabase!.from('logs').insert(log);
      if (error) {
        if (this.handleSupabaseError(error)) {
           // If error was auth, just save locally below
        } else {
           // Silent fail for logs if it's just a network blip
        }
      }
    }
    
    // Always keep a local copy for immediate display if needed
    const list = this.getLocal<AuditLog[]>(KEYS.LOGS, []);
    list.unshift(log); // Prepend
    this.setLocal(KEYS.LOGS, list.slice(0, 100)); // Keep last 100 locally
  }

  async getLogs(): Promise<AuditLog[]> {
    if (this.useSupabase) {
       const { data, error } = await this.supabase!.from('logs').select('*').order('timestamp', { ascending: false }).limit(100);
       if (error) {
         if (this.handleSupabaseError(error)) return this.getLogs(); // Retry locally
         return this.getLocal(KEYS.LOGS, []);
       }
       return data || [];
    }
    return this.getLocal(KEYS.LOGS, []);
  }

  // --- User Management ---
  async getUsers(): Promise<User[]> {
    if (this.useSupabase) {
      const { data, error } = await this.supabase!.from('users').select('*');
      if (error) {
        if (this.handleSupabaseError(error)) return this.getUsers(); // Retry locally
        // If not auth error, fall through to local default
      } else if (data && data.length > 0) {
        return data;
      }
    }
    
    const localUsers = this.getLocal<User[]>(KEYS.USERS, []);
    if (localUsers.length === 0) {
      return [DEFAULT_ADMIN];
    }
    return localUsers;
  }

  async saveUser(user: User) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('users').upsert(user);
      if (error) {
        if (this.handleSupabaseError(error)) {
           await this.saveUser(user); // Retry locally
           return;
        }
        throw new Error(error.message);
      }
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
      if (error) {
        if (this.handleSupabaseError(error)) {
           await this.deleteUser(id); // Retry locally
           return;
        }
        throw new Error(error.message);
      }
    } else {
      const list = await this.getUsers();
      this.setLocal(KEYS.USERS, list.filter(u => u.id !== id));
    }
    await this.logAction('delete', 'User', `Funcionário ID ${id} removido.`);
  }

  // Settings
  getLocalSettings(): AppSettings {
    const local = this.getLocal<AppSettings>(KEYS.SET, DEFAULT_SETTINGS);
    // MERGE STRATEGY: Hardcoded Source Code wins for Keys if they exist
    return {
        ...local,
        geminiApiKey: DEFAULT_SETTINGS.geminiApiKey || local.geminiApiKey,
        supabaseUrl: DEFAULT_SETTINGS.supabaseUrl || local.supabaseUrl,
        supabaseKey: DEFAULT_SETTINGS.supabaseKey || local.supabaseKey,
        whatsappApiUrl: DEFAULT_SETTINGS.whatsappApiUrl || local.whatsappApiUrl,
        whatsappApiToken: DEFAULT_SETTINGS.whatsappApiToken || local.whatsappApiToken,
        // Also ensure crucial arrays are not empty if local storage is cleared
        banks: local.banks.length ? local.banks : DEFAULT_SETTINGS.banks,
        categories: local.categories.length ? local.categories : DEFAULT_SETTINGS.categories,
        entities: local.entities.length ? local.entities : DEFAULT_SETTINGS.entities,
    };
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
    const current = this.getCurrentUser();
    if (current) {
        current.name = p.name;
        current.role = p.role;
        current.avatarUrl = p.avatarUrl;
        sessionStorage.setItem(KEYS.SESSION, JSON.stringify(current));
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
  async getClients(page: number = 1, pageSize: number = 50, search: string = ''): Promise<{ data: Client[], count: number }> {
    if (this.useSupabase) {
      let query = this.supabase!
        .from('clients')
        .select('*', { count: 'exact' }); 

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,cpf.ilike.%${search}%,mobile.ilike.%${search}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('createdAt', { ascending: false }) 
        .range(from, to);

      if (error) { 
        if (this.handleSupabaseError(error)) {
            return this.getClients(page, pageSize, search); // Retry locally
        }
        console.error('Supabase getClients error:', JSON.stringify(error)); 
        return { data: [], count: 0 }; 
      }
      return { data: data || [], count: count || 0 };
    }
    
    // Local Fallback
    let all = this.getLocal<Client[]>(KEYS.CLIENTS, []);
    if (search) {
      const s = search.toLowerCase();
      all = all.filter(c => c.name.toLowerCase().includes(s) || c.cpf.includes(s) || c.email.toLowerCase().includes(s));
    }
    all.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const start = (page - 1) * pageSize;
    const paginated = all.slice(start, start + pageSize);
    return { data: paginated, count: all.length };
  }

  async saveClient(c: Client) {
    const isNew = !c.id; 
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('clients').upsert(c);
      if (error) {
        if (this.handleSupabaseError(error)) {
            await this.saveClient(c); // Retry locally
            return;
        }
        if (error.message?.includes('column') || error.message?.includes('status') || error.message?.includes('triageNotes')) {
           console.warn("Schema mismatch detected. Retrying without new fields.");
           const { status, triageNotes, ...legacy } = c;
           const { error: retryError } = await this.supabase!.from('clients').upsert(legacy);
           if (retryError) throw new Error(retryError.message);
           throw new Error("PARTIAL_SUCCESS_MISSING_COLUMNS");
        }
        throw new Error(error.message);
      }
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
      if (error) {
        if (this.handleSupabaseError(error)) {
            await this.bulkUpsertClients(cs); // Retry locally
            return;
        }
        throw new Error(error.message);
      }
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
      if (error) {
        if (this.handleSupabaseError(error)) {
            await this.deleteClient(id); // Retry locally
            return;
        }
        throw new Error(error.message);
      }
    } else {
      this.setLocal(KEYS.CLIENTS, this.getLocal<Client[]>(KEYS.CLIENTS, []).filter(x => x.id !== id));
    }
    await this.logAction('delete', 'Client', `Cliente ID ${id} excluído.`);
  }

  // Transactions
  async getTransactions(): Promise<Transaction[]> {
    if (this.useSupabase) {
      const { data, error } = await this.supabase!.from('transactions').select('*').limit(2000);
      if (error) { 
        if (this.handleSupabaseError(error)) {
            return this.getTransactions(); // Retry locally
        }
        console.error('Supabase getTransactions error:', JSON.stringify(error)); 
        return []; 
      }
      return (data || []).map(t => ({ ...t, amount: Number(t.amount) }));
    }
    return this.getLocal(KEYS.TX, []);
  }

  async saveTransaction(t: Transaction) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('transactions').upsert(t);
      if (error) {
        if (this.handleSupabaseError(error)) {
            await this.saveTransaction(t); // Retry locally
            return;
        }
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
      if (error) {
        if (this.handleSupabaseError(error)) {
            await this.bulkUpsertTransactions(ts); // Retry locally
            return;
        }
        throw new Error(error.message);
      }
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
      if (error) {
        if (this.handleSupabaseError(error)) {
            await this.deleteTransaction(id); // Retry locally
            return;
        }
        throw new Error(error.message);
      }
    } else {
      this.setLocal(KEYS.TX, this.getLocal<Transaction[]>(KEYS.TX, []).filter(x => x.id !== id));
    }
    await this.logAction('delete', 'Transaction', `Transação ID ${id} excluída.`);
  }

  // Notes & Files
  async getNotes(): Promise<StickyNote[]> {
    if (this.useSupabase) { 
      const { data, error } = await this.supabase!.from('notes').select('*'); 
      if (error) {
        if (this.handleSupabaseError(error)) return this.getNotes(); // Retry locally
        return [];
      }
      return data || []; 
    }
    return this.getLocal(KEYS.NOTES, []);
  }

  async saveNote(n: StickyNote) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('notes').upsert(n);
      if (error) {
        if (this.handleSupabaseError(error)) { await this.saveNote(n); return; }
        throw new Error(error.message);
      }
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
      if (error) {
        if (this.handleSupabaseError(error)) { await this.deleteNote(id); return; }
        throw new Error(error.message);
      }
    } else {
      this.setLocal(KEYS.NOTES, this.getLocal<StickyNote[]>(KEYS.NOTES, []).filter(x => x.id !== id));
    }
  }

  async getFiles(): Promise<StoredFile[]> {
    if (this.useSupabase) { 
      const { data, error } = await this.supabase!.from('files').select('*'); 
      if (error) {
        if (this.handleSupabaseError(error)) return this.getFiles(); // Retry locally
        return [];
      }
      return data || []; 
    }
    return this.getLocal(KEYS.FILES, []);
  }

  async addFile(f: StoredFile) {
    if (this.useSupabase) {
      const { error } = await this.supabase!.from('files').upsert(f);
      if (error) {
        if (this.handleSupabaseError(error)) { await this.addFile(f); return; }
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
      if (error) {
        if (this.handleSupabaseError(error)) { await this.updateFile(f); return; }
        throw new Error(error.message);
      }
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
      if (error) {
        if (this.handleSupabaseError(error)) { await this.deleteFile(id); return; }
        throw new Error(error.message);
      }
    } else {
      this.setLocal(KEYS.FILES, this.getLocal<StoredFile[]>(KEYS.FILES, []).filter(x => x.id !== id));
    }
    await this.logAction('delete', 'File', `Arquivo ID ${id} excluído.`);
  }

  // Search & Analysis
  async searchGlobal(q: string, target: 'clients' | 'transactions') {
    const term = q.toLowerCase();
    if (target === 'clients') {
      const { data } = await this.getClients(1, 20, q);
      return data;
    }
    const list = await this.getTransactions();
    return list.filter(t => t.description.toLowerCase().includes(term));
  }

  async getFinancialMetrics(startDate: string, endDate: string) {
    const txs = await this.getTransactions();
    const filtered = txs.filter(t => t.date >= startDate && t.date <= endDate);
    
    const income = filtered.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = filtered.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    
    return {
      period: `${startDate} até ${endDate}`,
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      transactionCount: filtered.length,
      details: filtered.slice(0, 10)
    };
  }

  async getFullContext() {
    const { count: clientCount } = await this.getClients(1, 1);
    const txs = await this.getTransactions();
    return {
       summary: { 
         totalClients: clientCount, 
         txCount: txs.length, 
         balance: txs.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0) 
       },
       recent: txs.slice(0, 10),
       settings: this.getLocalSettings()
    };
  }
}

export const db = new DatabaseService();