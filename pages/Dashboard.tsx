import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Transaction, Client } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Users, Target, DollarSign, Activity, RefreshCw } from 'lucide-react';

const Card = ({ title, value, icon: Icon, trend, trendValue, color }: any) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
        <Icon size={24} className={`text-${color.split('-')[1]}-600`} />
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trendValue}
        </div>
      )}
    </div>
    <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

export const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState({
    income: 0,
    expenses: 0,
    profit: 0,
    ticket: 0,
    activeClients: 0
  });

  const fetchData = async () => {
    // Only set loading on first load to prevent flickering on realtime updates
    if (transactions.length === 0) setLoading(true);
    
    try {
      const [txs, cls] = await Promise.all([
        db.getTransactions(),
        db.getClients()
      ]);
      
      setTransactions(txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      const income = txs.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
      const expenses = txs.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
      const profit = income - expenses;
      const ticket = income / (txs.filter(t => t.type === 'income').length || 1);

      setMetrics({
        income,
        expenses,
        profit,
        ticket,
        activeClients: cls.length
      });
    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Subscribe to realtime changes
    const txSub = db.subscribe('transactions', fetchData);
    const clSub = db.subscribe('clients', fetchData);

    return () => {
      txSub?.unsubscribe();
      clSub?.unsubscribe();
    };
  }, []);

  // Prepare chart data (Weekly mock - in a real app this would be aggregated from transactions)
  const chartData = [
    { name: 'Seg', rec: metrics.income * 0.1, desp: metrics.expenses * 0.15 },
    { name: 'Ter', rec: metrics.income * 0.2, desp: metrics.expenses * 0.1 },
    { name: 'Qua', rec: metrics.income * 0.15, desp: metrics.expenses * 0.2 },
    { name: 'Qui', rec: metrics.income * 0.25, desp: metrics.expenses * 0.15 },
    { name: 'Sex', rec: metrics.income * 0.3, desp: metrics.expenses * 0.4 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 gap-2">
        <RefreshCw className="animate-spin" /> Carregando Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visão Geral</h1>
          <p className="text-slate-500 text-sm">Acompanhe a saúde financeira da sua empresa.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Atualizar Dados">
            <RefreshCw size={18} />
          </button>
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold border border-blue-100 flex items-center">
            Mês Atual
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card 
          title="Faturamento Total" 
          value={`R$ ${metrics.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          trend="up"
          trendValue="+12%"
          color="bg-blue-500"
        />
        <Card 
          title="Despesas" 
          value={`R$ ${metrics.expenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Activity}
          trend="down"
          trendValue="-2%"
          color="bg-rose-500"
        />
        <Card 
          title="Lucro Líquido" 
          value={`R$ ${metrics.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Target}
          trend={metrics.profit >= 0 ? 'up' : 'down'}
          trendValue={((metrics.profit / (metrics.income || 1)) * 100).toFixed(1) + '% mg'}
          color="bg-emerald-500"
        />
        <Card 
          title="Clientes Ativos" 
          value={metrics.activeClients}
          icon={Users}
          trend="up"
          trendValue="+5"
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[400px]">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Fluxo de Caixa Semanal</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `R$${val/1000}k`} />
                <Tooltip 
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Valor']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="rec" name="Receita" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="desp" name="Despesa" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Goal Progress & Recent Activity */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Meta Mensal</h3>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold text-slate-900">68%</span>
              <span className="text-sm text-slate-500 mb-1">da meta de R$ 100k</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: '68%' }}></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex-1">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Transações Recentes</h3>
            <div className="space-y-4">
              {transactions.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                      {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 line-clamp-1">{t.description}</p>
                      <p className="text-xs text-slate-500">{new Date(t.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {t.type === 'income' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Nenhuma transação registrada.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};