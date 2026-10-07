import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase, type Notificacion } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { isPushSupported, requestPushPermission, unsubscribePush, getPushSubscriptionJSON } from '@/lib/firebase';
import { CheckCircle2, AlertTriangle, CalendarDays, Bell } from 'lucide-react';

interface ToastNotification {
  id: string;
  titulo: string;
  mensaje: string | null;
  tipo: string;
}

interface NotificationContextType {
  notifications: Notificacion[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  toasts: ToastNotification[];
  dismissToast: (id: string) => void;
  pushEnabled: boolean;
  pushSupported: boolean;
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const toastIcons: Record<string, typeof Bell> = {
  alerta: AlertTriangle,
  servicio: CheckCircle2,
  reunion: CalendarDays,
  sistema: Bell,
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);

  const pushSupported = isPushSupported();

  const fetchNotifications = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setNotifications(data as Notificacion[]);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    fetchNotifications(user.id);

    const channel = supabase
      .channel('notificaciones-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as Notificacion;
          setNotifications((prev) => [newNotif, ...prev]);
          setToasts((prev) => [...prev, {
            id: newNotif.id,
            titulo: newNotif.titulo,
            mensaje: newNotif.mensaje,
            tipo: newNotif.tipo,
          }]);

          if (Notification.permission === 'granted') {
            try {
              navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(newNotif.titulo, {
                  body: newNotif.mensaje ?? '',
                  icon: '/icon-192.png',
                  badge: '/icon-192.png',
                  tag: newNotif.tipo,
                  data: { url: '/', tipo: newNotif.tipo },
                });
              });
            } catch { /* noop */ }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  useEffect(() => {
    if (!user || !pushSupported) return;

    (async () => {
      const { data } = await supabase
        .from('push_tokens')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);
      setPushEnabled(!!(data && data.length > 0));
    })();
  }, [user, pushSupported]);

  const enablePush = useCallback(async (): Promise<boolean> => {
    if (!user || !pushSupported) return false;

    const permission = await requestPushPermission();
    if (permission !== 'granted') return false;

    const subJSON = await getPushSubscriptionJSON();
    if (!subJSON) return false;

    const { error } = await supabase.rpc('register_push_token', {
      p_token: subJSON.endpoint,
      p_device_info: JSON.stringify(subJSON.keys),
    });
    if (error) {
      console.error('Error registering push token:', error);
      return false;
    }
    setPushEnabled(true);
    return true;
  }, [user, pushSupported]);

  const disablePush = useCallback(async () => {
    if (!user || !pushSupported) return;

    const subJSON = await getPushSubscriptionJSON();
    if (subJSON) {
      await supabase.rpc('unregister_push_token', { p_token: subJSON.endpoint });
    }
    await unsubscribePush();
    setPushEnabled(false);
  }, [user, pushSupported]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notificaciones').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await supabase.from('notificaciones').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [user]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      toasts,
      dismissToast,
      pushEnabled,
      pushSupported,
      enablePush,
      disablePush,
    }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastNotification[]; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => onDismiss(t.id), 5000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.tipo] ?? Bell;
        const colors: Record<string, string> = {
          alerta: 'bg-error-500',
          servicio: 'bg-success-500',
          reunion: 'bg-primary-600',
          sistema: 'bg-gray-800',
        };
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 ${colors[toast.tipo] ?? 'bg-gray-800'} text-white rounded-xl shadow-lg px-4 py-3 animate-slide-down pointer-events-auto cursor-pointer`}
            onClick={() => onDismiss(toast.id)}
          >
            <Icon size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{toast.titulo}</p>
              {toast.mensaje && <p className="text-xs opacity-90 mt-0.5 line-clamp-2">{toast.mensaje}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
