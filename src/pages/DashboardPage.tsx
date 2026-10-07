import { useEffect, useState, useCallback } from 'react';
import { Shield, Siren, Users, CalendarDays, AlertTriangle, MapPin, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Alerta, type Servicio, type Reunion } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

interface DashboardPageProps {
  onNavigate: (page: 'dashboard' | 'servicios' | 'alertas' | 'reuniones' | 'perfil') => void;
}

const nivelConfig = {
  bajo: { label: 'Bajo', variant: 'success' as const, color: 'text-success-600 bg-success-50' },
  medio: { label: 'Medio', variant: 'warning' as const, color: 'text-warning-600 bg-warning-50' },
  alto: { label: 'Alto', variant: 'error' as const, color: 'text-error-600 bg-error-50' },
  critico: { label: 'Crítico', variant: 'error' as const, color: 'text-error-600 bg-error-50' },
};

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ servicios: 0, alertasActivas: 0, reuniones: 0, voluntarios: 0 });
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [reuniones, setReuniones] = useState<Reunion[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [servRes, alertRes, reunionRes, volRes] = await Promise.all([
      supabase.from('servicios').select('*').eq('estado', 'abierto').order('fecha', { ascending: true }).limit(5),
      supabase.from('alertas').select('*').eq('estado', 'activa').order('created_at', { ascending: false }).limit(3),
      supabase.from('reuniones').select('*').order('fecha', { ascending: true }).limit(3),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    setServicios(servRes.data ?? []);
    setAlertas(alertRes.data ?? []);
    setReuniones(reunionRes.data ?? []);
    setStats({
      servicios: servRes.data?.length ?? 0,
      alertasActivas: alertRes.data?.length ?? 0,
      reuniones: reunionRes.data?.length ?? 0,
      voluntarios: volRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  const roleLabels: Record<string, string> = {
    admin_tecnico: 'Administrador Técnico',
    coordinador: 'Coordinador',
    voluntario: 'Voluntario',
  };

  const fullName = profile ? `${profile.nombre} ${profile.apellidos}` : '';

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Welcome */}
      <div className="bg-gradient-to-br from-primary-700 to-primary-900 rounded-2xl p-5 text-white shadow-md">
        <p className="text-sm text-primary-200">Bienvenido</p>
        <h1 className="text-xl font-bold">{fullName}</h1>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="accent">{roleLabels[profile?.role ?? 'voluntario']}</Badge>
          {profile?.indicativo && <span className="text-xs text-primary-200">· {profile.indicativo}</span>}
          {profile?.especialidad && <span className="text-xs text-primary-200">· {profile.especialidad}</span>}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Shield} label="Servicios abiertos" value={stats.servicios} color="primary" onClick={() => onNavigate('servicios')} />
        <StatCard icon={Siren} label="Alertas activas" value={stats.alertasActivas} color="error" onClick={() => onNavigate('alertas')} />
        <StatCard icon={CalendarDays} label="Próximas reuniones" value={stats.reuniones} color="accent" onClick={() => onNavigate('reuniones')} />
        <StatCard icon={Users} label="Voluntarios activos" value={stats.voluntarios} color="success" />
      </div>

      {/* Active Alerts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={18} className="text-error-500" />
            Alertas activas
          </h2>
          <button onClick={() => onNavigate('alertas')} className="text-xs text-primary-600 font-medium">
            Ver todas
          </button>
        </div>
        {alertas.length === 0 ? (
          <EmptyState icon={Siren} title="Sin alertas activas" description="No hay emergencias activas en este momento." />
        ) : (
          <div className="space-y-2">
            {alertas.map((alerta) => {
              const cfg = nivelConfig[alerta.nivel];
              return (
                <button
                  key={alerta.id}
                  onClick={() => onNavigate('alertas')}
                  className="card p-4 w-full text-left hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{alerta.titulo}</p>
                      {alerta.operativa && <p className="text-xs text-gray-500 mt-0.5">{alerta.operativa}</p>}
                      {alerta.punto_encuentro && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <MapPin size={12} /> {alerta.punto_encuentro}
                        </p>
                      )}
                    </div>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Upcoming Services */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Shield size={18} className="text-primary-600" />
            Próximos servicios
          </h2>
          <button onClick={() => onNavigate('servicios')} className="text-xs text-primary-600 font-medium">
            Ver todos
          </button>
        </div>
        {servicios.length === 0 ? (
          <EmptyState icon={Shield} title="No hay servicios abiertos" description="Cuando se cree un servicio aparecerá aquí." />
        ) : (
          <div className="space-y-2">
            {servicios.map((s) => (
              <button
                key={s.id}
                onClick={() => onNavigate('servicios')}
                className="card p-4 w-full text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{s.titulo}</p>
                    {s.ubicacion && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><MapPin size={12} /> {s.ubicacion}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.plazas} plazas</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Meetings */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays size={18} className="text-accent-500" />
            Próximas reuniones
          </h2>
          <button onClick={() => onNavigate('reuniones')} className="text-xs text-primary-600 font-medium">
            Ver todas
          </button>
        </div>
        {reuniones.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No hay reuniones programadas" />
        ) : (
          <div className="space-y-2">
            {reuniones.slice(0, 2).map((r) => (
              <button
                key={r.id}
                onClick={() => onNavigate('reuniones')}
                className="card p-4 w-full text-left hover:shadow-md transition-shadow"
              >
                <p className="font-semibold text-gray-900 text-sm">{r.titulo}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <CalendarDays size={12} />
                    {new Date(r.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {r.ubicacion && <span className="flex items-center gap-1"><MapPin size={12} /> {r.ubicacion}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, color, onClick,
}: {
  icon: typeof Shield; label: string; value: number; color: string; onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-600',
    accent: 'bg-accent-50 text-accent-600',
    success: 'bg-success-50 text-success-600',
    error: 'bg-error-50 text-error-600',
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="card p-4 text-left hover:shadow-md transition-shadow disabled:cursor-default"
    >
      <div className={`w-10 h-10 rounded-xl ${colorMap[color]} flex items-center justify-center mb-2`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </button>
  );
}
