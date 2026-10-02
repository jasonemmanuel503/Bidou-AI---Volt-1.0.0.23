import { newId } from './ids';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;

class ToastManager {
  private toasts: ToastMessage[] = [];
  private listeners: Set<ToastListener> = new Set();

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.toasts];
    this.listeners.forEach((l) => l(copy));
  }

  show(message: string, type: ToastType = 'info', duration = 4000) {
    const id = newId('toast_');
    const toast: ToastMessage = { id, message, type, duration };
    this.toasts = [...this.toasts, toast];
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
    return id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  error(message: string, duration = 5000) {
    return this.show(message, 'error', duration);
  }

  success(message: string, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  info(message: string, duration = 4000) {
    return this.show(message, 'info', duration);
  }

  warning(message: string, duration = 4000) {
    return this.show(message, 'warning', duration);
  }
}

export const toast = new ToastManager();
