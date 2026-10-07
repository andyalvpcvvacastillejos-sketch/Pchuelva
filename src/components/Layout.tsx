import { useState, type ReactNode } from 'react';
import { Home, Shield, Siren, Users, Bell, X, CheckCheck, BadgeCheck, TriangleAlert, MapPinned, Stethoscope } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { Badge } from './ui/Badge';

type Page = 'dashboard' | 'servicios' | 'alertas' | 'reuniones' | 'perfil' | 'acreditacion' | 'incidencias' | 'mapa' | 'asistencias';

interface LayoutProps {
  current: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

const navItems: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  { id: 'servicios', label: 'Servicios', icon: Shield },
  { id: 'alertas', label: 'Alertas', icon: Siren },
  { id: 'reuniones', label: 'Reuniones', icon: Users },
  { id: 'perfil', label: 'Perfil', icon: Bell },
  { id: 'acreditacion', label: 'Acreditación', icon: BadgeCheck },
  { id: 'incidencias', label: 'Incidencias', icon: TriangleAlert },
  { id: 'mapa', label: 'Mapa operativo', icon: MapPinned },
];

const staffNavItems: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'asistencias', label: 'Asistencias', icon: Stethoscope },
];

export function Layout({ current, onNavigate, children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const isStaff = profile?.role === 'admin_tecnico' || profile?.role === 'coordinador';
  const allNavItems = isStaff ? [...navItems, ...staffNavItems] : navItems;
  const [notifOpen, setNotifOpen] = useState(false);

  const initials = profile
    ? `${profile.nombre?.[0] ?? ''}${profile.apellidos?.[0] ?? ''}`.toUpperCase()
    : '';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-primary-800 text-white shadow-md">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <img
              src="/ayuntamientologo copy.png"
              alt="Ayuntamiento de Huelva"
              className="h-9 w-auto object-contain bg-white rounded-md px-1"
            />
            <div className="h-7 w-px bg-primary-600" />
            <div className="leading-tight">
              <p className="text-sm font-bold">Protección Civil</p>
              <p className="text-[10px] text-primary-200">Huelva</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotifOpen(true)}
              className="relative p-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-accent-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => onNavigate('perfil')}
              className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold hover:bg-primary-500 transition-colors"
            >
              {initials || '?'}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
        <div className="flex items-center justify-start gap-1 h-16 max-w-xl mx-auto overflow-x-auto px-1">
          {allNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = current === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-none w-[72px] flex-col items-center justify-center gap-0.5 h-full transition-colors ${
                  isActive ? 'text-primary-600' : 'text-gray-400'
                }`}
              >
                <Icon size={22} className={isActive ? 'scale-110' : ''} style={{ transition: 'transform 0.2s' }} />
                <span className="text-[10px] font-medium">{item.label}</span>
                {isActive && <div className="absolute bottom-0 w-8 h-0.5 bg-primary-600 rounded-full" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Notification Panel */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setNotifOpen(false)} />
          <div className="relative w-full max-w-sm bg-white h-full shadow-xl animate-slide-down flex flex-col">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Notificaciones</h2>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-xs text-primary-600 font-medium hover:text-primary-700"
                  >
                    <CheckCheck size={14} />
                    Marcar todas
                  </button>
                )}
                <button onClick={() => setNotifOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <Bell size={40} className="mb-2" />
                  <p className="text-sm">No tienes notificaciones</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { if (!n.read) markAsRead(n.id); }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      !n.read ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!n.read && <div className="w-2 h-2 rounded-full bg-accent-500 mt-1.5 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{n.titulo}</p>
                        {n.mensaje && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.mensaje}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={n.tipo === 'alerta' ? 'error' : n.tipo === 'servicio' ? 'success' : n.tipo === 'reunion' ? 'primary' : 'gray'}>
                            {n.tipo}
                          </Badge>
                          <span className="text-[10px] text-gray-400">
                            {new Date(n.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            {profile && (
              <div className="px-4 py-3 border-t border-gray-100">
                <button onClick={signOut} className="btn-outline w-full text-error-600 border-error-200 hover:bg-error-50">
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
