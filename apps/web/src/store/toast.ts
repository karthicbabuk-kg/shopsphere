import { create } from 'zustand';

type Severity = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  message: string;
  severity: Severity;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, severity?: Severity) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, severity = 'success') =>
    set((s) => ({ toasts: [...s.toasts, { id: next++, message, severity }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToasts.getState().push(m, 'success'),
  error: (m: string) => useToasts.getState().push(m, 'error'),
  info: (m: string) => useToasts.getState().push(m, 'info'),
};
