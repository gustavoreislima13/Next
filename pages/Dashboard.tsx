import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../services/db';
import { Transaction, Client } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Users, Target, DollarSign, Activity, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
import { useTheme } from '../components/ThemeContext';

const Card = ({ title, value, icon: Icon, trend, trendValue, color }: any) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-10 dark:bg-opacity-20 text-${color.split('-')[1]}-600 dark:text-${color.split('-')[1]}-400`}>
        <Icon size={24} className={`text-${color.split('-')[1]}-600 dark:text-${color.split('-')[1]}-400`} />
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trendValue}
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
  
  // Date Filtering State
  const [rangeMode, setRangeMode] = useState<RangeMode>('week');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  const fetchData = async () => {
    if (transactions.length === 0) setLoading(true);
    try {
      const [txs, cls] = await Promise.all([
        db.getTransactions(),
        db.getClients(1, 1000) // Fetch up to 1000 for dashboard overview
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
      // Current week (Monday to Sunday)
      const day = now.getDay() || 7; // Get current day number, converting Sun(0) to 7
      if (day !== 1) now.setHours(-24 * (day - 1)); // Go back to Monday
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

    const income = filteredTxs.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expenses = filteredTxs.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const profit = income - expenses;
    const ticket = income / (filteredTxs.filter(t => t.type === 'income').length || 1);

    return { txs: filteredTxs, income, expenses, profit, ticket };
  }, [transactions, rangeMode, customRange]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
    const dataMap = new Map<string, { name: string, rec: number, desp: number, sortKey: number }>();
    
    filteredData.txs.forEach(t => {
      const d = new Date(t.date);
      let key = '';
      let name = '';
      let sortKey = d.getTime();

      if (rangeMode === 'all') {
        // Group by Month
        key = `${d.getFullYear()}-${d.getMonth()}`;
        name = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        // Normalize sort key to start of month
        sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      } else {
        // Group by Day
        key = t.date; // YYYY-MM-DD
        name = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (rangeMode === 'week') {
            // Add day of week name
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

    // Fill missing days for 'Week' view to look pretty
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
      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 gap-2">
        <RefreshCw className="animate-spin" /> Carregando Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Visão Geral</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Acompanhe a saúde financeira da sua empresa.</p>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
             <button onClick={() => setRangeMode('week')} className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${rangeMode === 'week' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Semana</button>
             <button onClick={() => setRangeMode('month')} className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${rangeMode === 'month' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Mês</button>
             <button onClick={() => setRangeMode('all')} className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${rangeMode === 'all' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Geral</button>
             <button onClick={() => setRangeMode('custom')} className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${rangeMode === 'custom' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Personalizado</button>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card 
          title="Faturamento" 
          value={`R$ ${filteredData.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          trend="up"
          trendValue="Período"
          color="bg-blue-500"
        />
        <Card 
          title="Despesas" 
          value={`R$ ${filteredData.expenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Activity}
          trend="down"
          trendValue="Período"
          color="bg-rose-500"
        />
        <Card 
          title="Lucro Líquido" 
          value={`R$ ${filteredData.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Target}
          trend={filteredData.profit >= 0 ? 'up' : 'down'}
          trendValue={((filteredData.profit / (filteredData.income || 1)) * 100).toFixed(1) + '% mg'}
          color="bg-emerald-500"
        />
        <Card 
          title="Clientes Totais" 
          value={clients.length}
          icon={Users}
          trend="up"
          trendValue="Base Total"
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[400px]">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Fluxo de Caixa ({rangeMode === 'week' ? 'Semanal' : rangeMode === 'month' ? 'Mensal' : rangeMode === 'all' ? 'Histórico' : 'Personalizado'})</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `R$${val/1000}k`} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <Tooltip 
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Valor']}
                  contentStyle={{ 
                    borderRadius: '8px', 
                    border: 'none', 
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                    color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                  }}
                  itemStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#1e293b' }}
                />
                <Bar dataKey="rec" name="Receita" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="desp" name="Despesa" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Goal Progress & Recent Activity */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Meta Mensal (R$ 100k)</h3>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{((filteredData.income / 100000) * 100).toFixed(0)}%</span>
              <span className="text-sm text-slate-500 dark:text-slate-400 mb-1">alcançada</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3">
              <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${Math.min(((filteredData.income / 100000) * 100), 100)}%` }}></div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex-1">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Últimas do Período</h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredData.txs.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-lg transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}`}>
                      {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">{t.description}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(t.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {t.type === 'income' ? '+' : '-'} R$ {t.amount.toFixed(2)}
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
    </div>
  );
};