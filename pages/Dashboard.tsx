import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../services/db';
import { Transaction, Client } from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, Users, Target, DollarSign, 
  Activity, RefreshCw, TrendingUp, Wallet, PieChart as PieChartIcon
} from 'lucide-react';
import { useTheme } from '../components/ThemeContext';

// Cores para os gráficos
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Card = ({ title, value, subValue, icon: Icon, colorClass, trend }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
    <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${colorClass.replace('bg-', 'text-')}`}>
      <Icon size={64} />
    </div>
    <div className="flex flex-col relative z-10">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colorClass} bg-opacity-20 text-current`}>
          <Icon size={20} className={colorClass.replace('bg-', 'text-').replace('100', '600')} />
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">{value}</span>
      </div>
      {subValue && (
        <div className={`text-xs font-medium mt-2 flex items-center gap-1 ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-slate-500'}`}>
          {trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : null}
          {subValue}
        </div>
      )}
    </div>
  </div>
);

type RangeMode = 'week' | 'month' | 'year' | 'all';

export const Dashboard: React.FC = () => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  
  // Date Filtering State
  const [rangeMode, setRangeMode] = useState<RangeMode>('month');

  const fetchData = async () => {
    if (transactions.length === 0) setLoading(true);
    try {
      const [txs, cls] = await Promise.all([
        db.getTransactions(),
        db.getClients(1, 2000) // Fetch larger set for BI
      ]);
      setTransactions(txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setClients(cls.data);
    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const txSub = db.subscribe('transactions', fetchData);
    const clSub = db.subscribe('clients', fetchData);
    return () => { txSub?.unsubscribe(); clSub?.unsubscribe(); };
  }, []);

  // --- BI Logic & Aggregations ---

  const filteredData = useMemo(() => {
    const now = new Date();
    let start = new Date(0);
    let end = new Date(now.getFullYear() + 10, 0, 1);

    if (rangeMode === 'week') {
      const day = now.getDay() || 7;
      if (day !== 1) now.setHours(-24 * (day - 1));
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 23, 59, 59);
    } else if (rangeMode === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (rangeMode === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }

    const txs = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    });

    const income = txs.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expenses = txs.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const profit = income - expenses;
    const margin = income > 0 ? (profit / income) * 100 : 0;
    
    // Ticket Médio
    const incomeCount = txs.filter(t => t.type === 'income').length;
    const ticket = incomeCount > 0 ? income / incomeCount : 0;

    return { txs, income, expenses, profit, margin, ticket };
  }, [transactions, rangeMode]);

  // 1. Chart: Financial Trend (Area)
  const trendData = useMemo(() => {
    const dataMap = new Map<string, { name: string, Receita: number, Despesa: number, sortKey: number }>();
    
    filteredData.txs.forEach(t => {
      const d = new Date(t.date);
      let key = '', name = '', sortKey = 0;

      if (rangeMode === 'year' || rangeMode === 'all') {
        key = `${d.getFullYear()}-${d.getMonth()}`;
        name = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      } else {
        key = t.date;
        name = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        sortKey = d.getTime();
      }

      if (!dataMap.has(key)) dataMap.set(key, { name, Receita: 0, Despesa: 0, sortKey });
      const entry = dataMap.get(key)!;
      if (t.type === 'income') entry.Receita += t.amount;
      else entry.Despesa += t.amount;
    });

    return Array.from(dataMap.values()).sort((a, b) => a.sortKey - b.sortKey);
  }, [filteredData.txs, rangeMode]);

  // 2. Chart: Expenses by Category (Donut)
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.txs.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Outros';
      map.set(cat, (map.get(cat) || 0) + t.amount);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value); // Sort descending
  }, [filteredData.txs]);

  // 3. Chart: Top Clients (Bar)
  const topClientsData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.txs.filter(t => t.type === 'income' && t.clientId).forEach(t => {
      const cid = t.clientId!;
      map.set(cid, (map.get(cid) || 0) + t.amount);
    });
    
    return Array.from(map.entries())
      .map(([id, value]) => ({
        name: clients.find(c => c.id === id)?.name || 'Cliente Removido',
        value
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5
  }, [filteredData.txs, clients]);

  // 4. Client Status Stats
  const clientStats = useMemo(() => {
    const total = clients.length;
    const leads = clients.filter(c => c.status === 'Lead').length;
    const active = clients.filter(c => c.status === 'Fechado' || c.status === 'Em Negociação').length;
    return { total, leads, active };
  }, [clients]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 gap-2">
        <RefreshCw className="animate-spin" /> Carregando Business Intelligence...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="text-blue-600" /> Dashboard BI
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Análise estratégica de desempenho.</p>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 flex shadow-sm">
           {(['week', 'month', 'year', 'all'] as RangeMode[]).map(mode => (
             <button 
               key={mode}
               onClick={() => setRangeMode(mode)}
               className={`px-4 py-2 text-sm font-medium rounded-md transition-all capitalize ${rangeMode === mode ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
             >
               {mode === 'week' ? 'Semana' : mode === 'month' ? 'Mês' : mode === 'year' ? 'Ano' : 'Tudo'}
             </button>
           ))}
           <button onClick={fetchData} className="px-3 border-l border-slate-100 dark:border-slate-800 text-slate-400 hover:text-blue-500">
             <RefreshCw size={16} />
           </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card 
          title="Receita Total" 
          value={`R$ ${filteredData.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subValue="Entradas do período"
          icon={DollarSign}
          colorClass="bg-blue-100"
          trend="up"
        />
        <Card 
          title="Despesas" 
          value={`R$ ${filteredData.expenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subValue="Saídas do período"
          icon={Wallet}
          colorClass="bg-rose-100"
          trend="down"
        />
        <Card 
          title="Lucro Líquido" 
          value={`R$ ${filteredData.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subValue={`${filteredData.margin.toFixed(1)}% de Margem`}
          icon={Target}
          colorClass="bg-emerald-100"
          trend={filteredData.profit > 0 ? 'up' : 'down'}
        />
        <Card 
          title="Ticket Médio" 
          value={`R$ ${filteredData.ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subValue="Por venda realizada"
          icon={TrendingUp}
          colorClass="bg-purple-100"
          trend="up"
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Area Chart: Cash Flow Trend */}
        <div className="col-span-12 lg:col-span-8 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Activity size={18} className="text-blue-500" /> Fluxo de Caixa (Tendência)
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDesp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `R$${val/1000}k`} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`]}
                  contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#1e293b' }}
                />
                <Area type="monotone" dataKey="Receita" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRec)" />
                <Area type="monotone" dataKey="Despesa" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorDesp)" />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart: Expenses Breakdown */}
        <div className="col-span-12 lg:col-span-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
            <PieChartIcon size={18} className="text-rose-500" /> Distribuição de Despesas
          </h3>
          <div className="flex-1 min-h-[300px] relative">
             {categoryData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={categoryData}
                     cx="50%"
                     cy="50%"
                     innerRadius={60}
                     outerRadius={100}
                     paddingAngle={5}
                     dataKey="value"
                   >
                     {categoryData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                     ))}
                   </Pie>
                   <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`} />
                   <Legend verticalAlign="bottom" height={36} iconType="circle" />
                 </PieChart>
               </ResponsiveContainer>
             ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                  Sem dados de despesas.
                </div>
             )}
          </div>
        </div>

        {/* Bottom Row */}
        
        {/* Top Clients (Bar Chart) */}
        <div className="col-span-12 lg:col-span-6 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
           <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
             <Target size={18} className="text-emerald-500" /> Top 5 Clientes (Receita)
           </h3>
           <div className="h-[250px] w-full">
             {topClientsData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={topClientsData} layout="vertical" margin={{ left: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                   <XAxis type="number" hide />
                   <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                   <Tooltip cursor={{fill: 'transparent'}} formatter={(val: number) => `R$ ${val.toLocaleString('pt-BR')}`} />
                   <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                 </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem dados de vendas.</div>
             )}
           </div>
        </div>

        {/* Client Pipeline / Status */}
        <div className="col-span-12 lg:col-span-6 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
           <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
             <Users size={18} className="text-purple-500" /> Funil de Clientes
           </h3>
           <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 text-center">
                 <p className="text-slate-500 dark:text-slate-400 text-sm uppercase font-bold tracking-wider">Base Total</p>
                 <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{clientStats.total}</p>
                 <span className="text-xs text-slate-400">Clientes cadastrados</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50 text-center">
                 <p className="text-blue-600 dark:text-blue-300 text-sm uppercase font-bold tracking-wider">Leads</p>
                 <p className="text-3xl font-bold text-blue-700 dark:text-blue-400 mt-2">{clientStats.leads}</p>
                 <span className="text-xs text-blue-400 dark:text-blue-500/70">Potenciais</span>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/50 text-center col-span-2">
                 <p className="text-emerald-600 dark:text-emerald-300 text-sm uppercase font-bold tracking-wider">Ativos / Negociação</p>
                 <p className="text-4xl font-bold text-emerald-700 dark:text-emerald-400 mt-2">{clientStats.active}</p>
                 <div className="w-full bg-emerald-200 dark:bg-emerald-900 h-2 rounded-full mt-3 overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{ width: `${clientStats.total > 0 ? (clientStats.active / clientStats.total) * 100 : 0}%` }}></div>
                 </div>
                 <span className="text-xs text-emerald-600 dark:text-emerald-500/70 mt-1 block">
                   Taxa de Conversão da Base: {clientStats.total > 0 ? ((clientStats.active / clientStats.total) * 100).toFixed(1) : 0}%
                 </span>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};