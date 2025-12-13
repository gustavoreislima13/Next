import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-fade-in
              ${toast.type === 'success' ? 'bg-white dark:bg-slate-900 border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-400' : ''}
              ${toast.type === 'error' ? 'bg-white dark:bg-slate-900 border-rose-100 dark:border-rose-900 text-rose-800 dark:text-rose-400' : ''}
              ${toast.type === 'info' ? 'bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-900 text-blue-800 dark:text-blue-400' : ''}
              ${toast.type === 'warning' ? 'bg-white dark:bg-slate-900 border-amber-100 dark:border-amber-900 text-amber-800 dark:text-amber-400' : ''}
            `}
            style={{ minWidth: '300px' }}
          >
            {toast.type === 'success' && <CheckCircle size={20} className="text-emerald-500" />}
            {toast.type === 'error' && <AlertCircle size={20} className="text-rose-500" />}
            {toast.type === 'info' && <Info size={20} className="text-blue-500" />}
            {toast.type === 'warning' && <AlertTriangle size={20} className="text-amber-500" />}
            
            <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{toast.message}</p>
            
            <button onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};