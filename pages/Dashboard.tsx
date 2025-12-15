import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../services/db';
import { Transaction, Client } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Users, Target, DollarSign, Activity, RefreshCw, TrendingUp, PieChart as PieChartIcon, Award, CloudOff } from 'lucide-react';
import { useTheme } from '../components/ThemeContext';
import { Link } from 'react-router-dom';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

const Card = ({ title, value, subValue, icon: Icon, trend, trendValue, color }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 hover:shadow-md">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-10 dark:bg-opacity-20 text-${color.split('-')[1]}-600 dark:text-${color.split('-')[1]}-400`}>
        <Icon size={24} className={`text-${color.split('-')[1]}-600 dark:text-${color.split('-')[1]}-400`} />
      </div>
      {trend && (
        <div className={`flex flex-col items-end`}>
             <div className={`flex items-center gap-1 text-xs font-bold ${trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : trend === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                {trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : null}
                {trendValue}
             </div>
             {subValue && <span className="text-[10px] text-slate-400 mt-0.5">{subValue}</span>}
        </div>
      )}
    </div>
    <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{title}</h3>
    <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
  </div>
);

type RangeMode = 'week' | 'month' | 'all' | 'custom';

export const Dashboard: React.FC = () => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isSupabase, setIsSupabase] = useState(false);
  
  // Date Filtering State
  const [rangeMode, setRangeMode] = useState<RangeMode>('week');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  const fetchData = async () => {
    if (transactions.length === 0) setLoading(true);
    try {
      setIsSupabase(db.isSupabaseConfigured());
      const [txs, cls] = await Promise.all([
        db.getTransactions(),
        db.getClients(1, 2000) 
      ]);
      setTransactions(txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
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

  // Filter Data Logic
  const filteredData = useMemo(() => {
    const now = new Date();
    let start = new Date(0); // Epoch
    let end = new Date(now.getFullYear() + 10, 0, 1); // Future

    if (rangeMode === 'week') {
      const day = now.getDay() || 7; 
      if (day !== 1) now.setHours(-24 * (day - 1)); 
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 23, 59, 59);
    } else if (rangeMode === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (rangeMode === 'custom' && customRange.start && customRange.end) {
      start = new Date(customRange.start);
      end = new Date(customRange.end);
      end.setHours(23, 59, 59);
    }

    const filteredTxs = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    });

    // 1. Basic Metrics
    const income = filteredTxs.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expenses = filteredTxs.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const profit = income - expenses;
    const txCount = filteredTxs.filter(t => t.type === 'income').length;
    const ticket = income / (txCount || 1);

    // 2. New Clients in Period
    const newClients = clients.filter(c => {
       const d = new Date(c.createdAt);
       return d >= start && d <= end;
    }).length;

    // 3. Expenses by Category (Pie Chart)
    const catMap = new Map<string, number>();
    filteredTxs.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.category || 'Outros';
        catMap.set(cat, (catMap.get(cat) || 0) + t.amount);
    });
    const expenseByCategory = Array.from(catMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // 4. Top Clients by Revenue
    const clientMap = new Map<string, number>();
    filteredTxs.filter(t => t.type === 'income' && t.clientId).forEach(t => {
         clientMap.set(t.clientId!, (clientMap.get(t.clientId!) || 0) + t.amount);
    });
    const topClients = Array.from(clientMap.entries())
        .map(([id, value]) => {
            const client = clients.find(c => c.id === id);
            return { name: client?.name || 'Cliente Desconhecido', value, id };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    return { txs: filteredTxs, income, expenses, profit, ticket, newClients, expenseByCategory, topClients };
  }, [transactions, rangeMode, customRange, clients]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
    const dataMap = new Map<string, { name: string, rec: number, desp: number, sortKey: number }>();
    
    filteredData.txs.forEach(t => {
      const d = new Date(t.date);
      let key = '';
      let name = '';
      let sortKey = d.getTime();

      if (rangeMode === 'all') {
        key = `${d.getFullYear()}-${d.getMonth()}`;
        name = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      } else {
        key = t.date; 
        name = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (rangeMode === 'week') {
            const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            name = weekDays[d.getDay()];
        }
      }

      if (!dataMap.has(key)) {
        dataMap.set(key, { name, rec: 0, desp: 0, sortKey });
      }
      
      const entry = dataMap.get(key)!;
      if (t.type === 'income') entry.rec += t.amount;
      else entry.desp += t.amount;
    });

    if (rangeMode === 'week') {
        const today = new Date();
        const currentDay = today.getDay() || 7; 
        const monday = new Date(today);
        if (currentDay !== 1) monday.setHours(-24 * (currentDay - 1));
        
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const key = d.toISOString().split('T')[0];
            if (!dataMap.has(key)) {
                 const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                 dataMap.set(key, { name: weekDays[d.getDay()], rec: 0, desp: 0, sortKey: d.getTime() });
            }
        }
    }

    return Array.from(dataMap.values()).sort((a, b) => a.sortKey - b.sortKey);
  }, [filteredData.txs, rangeMode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 gap-2 animate-pulse">
        <RefreshCw className="animate-spin" /> Carregando Nexus BI...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Business Intelligence
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Visão 360º da saúde financeira e comercial.</p>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
             {['week', 'month', 'all', 'custom'].map(m => (
               <button 
                 key={m}
                 onClick={() => setRangeMode(m as RangeMode)} 
                 className={`px-3 py-1.5 text-xs font-bold uppercase rounded transition-all ${rangeMode === m ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
               >
                 {m === 'all' ? 'Tudo' : m === 'week' ? 'Semana' : m === 'month' ? 'Mês' : 'Personalizado'}
               </button>
             ))}
          </div>
          
          {rangeMode === 'custom' && (
             <div className="flex items-center gap-2 px-2 animate-fade-in text-slate-900 dark:text-white">
               <input type="date" className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none bg-transparent" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} />
               <span className="text-slate-400">-</span>
               <input type="date" className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none bg-transparent" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} />
             </div>
          )}
          
          <button onClick={fetchData} className="p-2 text-slate-400 hover:text-blue-600 transition-colors border-l border-slate-200 dark:border-slate-800 pl-3 ml-1" title="Atualizar Dados">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Local Storage Warning */}
      {!isSupabase && (
         <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-start gap-3">
            <CloudOff className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={20} />
            <div>
               <h3 className="font-bold text-amber-900 dark:text-amber-300 text-sm">Armazenamento Local (Offline)</h3>
               <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                 O sistema está salvando dados apenas <strong>neste navegador</strong>. 
                 As informações não aparecerão em outros computadores ou navegadores.
               </p>
               <Link to="/config?tab=api" className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline mt-2 inline-block">
                 → Configurar Supabase para sincronizar dados na nuvem
               </Link>
            </div>
         </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card 
          title="Faturamento" 
          value={`R$ ${filteredData.income.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue={`Ticket Médio: R$ ${filteredData.ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          trend="up"
          trendValue="Período"
          color="bg-blue-500"
        />
        <Card 
          title="Despesas" 
          value={`R$ ${filteredData.expenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={Activity}
          trend={filteredData.expenses > 0 ? "down" : "neutral"}
          trendValue="Período"
          color="bg-rose-500"
        />
        <Card 
          title="Lucro Líquido" 
          value={`R$ ${filteredData.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue={`Margem: ${((filteredData.profit / (filteredData.income || 1)) * 100).toFixed(1)}%`}
          icon={Target}
          trend={filteredData.profit >= 0 ? 'up' : 'down'}
          trendValue="Resultado"
          color="bg-emerald-500"
        />
        <Card 
          title="Base de Clientes" 
          value={clients.length}
          subValue={filteredData.newClients > 0 ? `+${filteredData.newClients} novos no período` : 'Sem novos cadastros'}
          icon={Users}
          trend={filteredData.newClients > 0 ? 'up' : 'neutral'}
          trendValue={filteredData.newClients > 0 ? "Crescimento" : "Estável"}
          color="bg-purple-500"
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[400px]">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-500" /> Fluxo de Caixa
          </h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `R$${val/1000}k`} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                <Tooltip 
                  cursor={{fill: theme === 'dark' ? '#1e293b' : '#f1f5f9'}}
                  formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, '']}
                  contentStyle={{ 
                    borderRadius: '8px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: theme === 'dark' ? '#0f172a' : '#fff',
                    color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                  }}
                  labelStyle={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', marginBottom: '0.5rem' }}
                />
                <Bar dataKey="rec" name="Receita" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                <Bar dataKey="desp" name="Despesa" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
            <PieChartIcon size={20} className="text-rose-500" /> Despesas por Categoria
          </h3>
          <div className="flex-1 min-h-[300px] relative">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={filteredData.expenseByCategory}
                   cx="50%"
                   cy="50%"
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={5}
                   dataKey="value"
                 >
                   {filteredData.expenseByCategory.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={theme === 'dark' ? '#0f172a' : '#fff'} strokeWidth={2} />
                   ))}
                 </Pie>
                 <Tooltip formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`} contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: theme === 'dark' ? '#fff' : '#000' }} />
                 <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
               </PieChart>
             </ResponsiveContainer>
             {filteredData.expenseByCategory.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                  Sem despesas no período.
                </div>
             )}
          </div>
        </div>
      </div>

      {/* Row 3: Top Clients & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
             <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
               <Award size={20} className="text-yellow-500" /> Top Clientes (Receita)
             </h3>
             <div className="space-y-4">
               {filteredData.topClients.map((client, idx) => (
                 <div key={idx} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${idx === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                         {idx + 1}
                       </div>
                       <div>
                         <p className="text-sm font-bold text-slate-900 dark:text-white">{client.name}</p>
                         <p className="text-xs text-slate-500 dark:text-slate-400">Contribuição no período</p>
                       </div>
                    </div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      R$ {client.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                 </div>
               ))}
               {filteredData.topClients.length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-8">Nenhuma receita vinculada a clientes no período.</p>
               )}
             </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
               <Activity size={20} className="text-slate-500" /> Últimas Transações
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredData.txs.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-lg transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}`}>
                      {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">{t.description}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(t.date).toLocaleDateString()} • {t.category}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              {filteredData.txs.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Nenhuma transação neste período.</p>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};