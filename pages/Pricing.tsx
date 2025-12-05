import React, { useState, useEffect } from 'react';
import { Calculator, HelpCircle } from 'lucide-react';

export const Pricing: React.FC = () => {
  const [cost, setCost] = useState(100);
  const [tax, setTax] = useState(15);
  const [margin, setMargin] = useState(30);
  const [fixed, setFixed] = useState(10);
  
  const [results, setResults] = useState({
    price: 0,
    profit: 0,
    taxValue: 0
  });

  useEffect(() => {
    // Formula: Price = (Cost + Fixed) / (1 - (Tax + Margin)/100)
    const totalCost = Number(cost) + Number(fixed);
    const divisor = 1 - ((Number(tax) + Number(margin)) / 100);
    
    let suggestedPrice = 0;
    if (divisor > 0) {
      suggestedPrice = totalCost / divisor;
    }

    const taxVal = suggestedPrice * (Number(tax) / 100);
    const profitVal = suggestedPrice * (Number(margin) / 100);

    setResults({
      price: suggestedPrice,
      profit: profitVal,
      taxValue: taxVal
    });
  }, [cost, tax, margin, fixed]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center justify-center gap-2">
          <Calculator className="text-blue-600" /> Calculadora de Preço
        </h1>
        <p className="text-slate-500">Defina o preço de venda ideal baseado em custos e margens.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Inputs */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 border-b pb-2">Custos e Margens</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Custo do Produto/Hora (R$)</label>
            <input 
              type="number" 
              className="w-full text-lg px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={cost}
              onChange={e => setCost(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Despesas Fixas Rateadas (R$)</label>
            <input 
              type="number" 
              className="w-full text-lg px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={fixed}
              onChange={e => setFixed(Number(e.target.value))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Impostos (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="w-full text-lg px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={tax}
                  onChange={e => setTax(Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Margem Desejada (%)</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="w-full text-lg px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={margin}
                  onChange={e => setMargin(Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Outputs */}
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex flex-col justify-center space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-blue-500 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          
          <div className="text-center space-y-2 z-10">
            <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Preço Sugerido</h3>
            <p className="text-5xl font-bold tracking-tight text-emerald-400">
              R$ {results.price.toFixed(2)}
            </p>
          </div>

          <div className="space-y-4 border-t border-slate-700 pt-6 z-10">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Lucro Líquido Estimado</span>
              <span className="text-xl font-semibold text-white">R$ {results.profit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Impostos a Pagar</span>
              <span className="text-xl font-semibold text-rose-400">R$ {results.taxValue.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-lg text-xs text-slate-400 leading-relaxed z-10 flex gap-2">
            <HelpCircle size={16} className="shrink-0 mt-0.5" />
            <p>O cálculo utiliza o Markup divisor. Se o divisor (1 - taxas) for menor ou igual a zero, o preço tende ao infinito. Ajuste as porcentagens.</p>
          </div>
        </div>
      </div>
    </div>
  );
};