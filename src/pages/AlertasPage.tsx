import { useEffect, useState, useCallback } from 'react';
import { Siren, Plus, MapPin, AlertTriangle, Activity, Radio, Share2, Check, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Alerta, type AlertaRespuesta } from '@/lib/supabase';
import { processPendingPushNotifications } from '@/lib/push';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function shareOnWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function buildAlertaShareText(alerta: Alerta): string {
  let text = `ALERTA: ${alerta.titulo}\nNivel: ${alerta.nivel.toUpperCase()}\n`;
  if (alerta.descripcion) text += `\n${alerta.descripcion}\n`;
  if (alerta.operativa) text += `\nOperativa: ${alerta.operativa}\n`;
  if (alerta.punto_encuentro) text += `Punto de encuentro: ${alerta.punto_encuentro}\n`;
  return `${text}\nProtección Civil Huelva`;
}

const nivelConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'error'; bg: string; border: string; icon: string }> = {
  bajo: { label: 'Bajo', variant: 'success', bg: 'bg-success-50', border: 'border-success-200', icon: 'text-success-600' },
  medio: { label: 'Medio', variant: 'warning', bg: 'bg-warning-50', border: 'border-warning-200', icon: 'text-warning-600' },
  alto: { label: 'Alto', variant: 'error', bg: 'bg-error-50', border: 'border-error-200', icon: 'text-error-600' },
  critico: { label: 'Crítico', variant: 'error', bg: 'bg-error-100', border: 'border-error-300', icon: 'text-error-700' },
};

type AlertaWithResponses = Alerta & { respuestas: AlertaRespuesta[]; my_response: boolean };

export function AlertasPage() {
  const { profile, user } = useAuth();
  const isStaff = profile?.role === 'admin_tecnico' || profile?.role === 'coordinador';
  const [loading, setLoading] = useState(true);
  const [alertas, setAlertas] = useState<AlertaWithResponses[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Alerta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAlertas = useCallback(async () => {
    setLoading(true);
    const [alertasRes, responsesRes] = await Promise.all([
      supabase.from('alertas').select('*').order('created_at', { ascending: false }),
      supabase.from('alerta_respuestas').select('*').order('created_at', { ascending: true }),
    ]);
    const rawResponses = (responsesRes.data ?? []) as AlertaRespuesta[];
    const userIds = [...new Set(rawResponses.map((response) => response.user_id))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', userIds)
      : { data: [] };
    const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const responses = rawResponses.map((response) => ({
      ...response,
      profile: profilesById.get(response.user_id),
    }));
    const responseMap = new Map<string, AlertaRespuesta[]>();
    for (const response of responses) {
      const list = responseMap.get(response.alerta_id) ?? [];
      list.push(response);
      responseMap.set(response.alerta_id, list);
    }
    setAlertas((alertasRes.data ?? []).map((alerta: Alerta) => ({
      ...alerta,
      respuestas: responseMap.get(alerta.id) ?? [],
      my_response: responses.some((response) => response.alerta_id === alerta.id && response.user_id === user?.id),
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAlertas(); }, [fetchAlertas]);

  const toggleParticipation = async (alerta: AlertaWithResponses) => {
    if (!user) return;
    setError(null);
    if (alerta.my_response) {
      const { error: deleteError } = await supabase.from('alerta_respuestas').delete().eq('alerta_id', alerta.id).eq('user_id', user.id);
      if (deleteError) setError('No se pudo cancelar la participación.');
    } else {
      const { error: insertError } = await supabase.from('alerta_respuestas').insert({ alerta_id: alerta.id, user_id: user.id });
      if (insertError) setError(insertError.code === '23505' ? 'Ya estás apuntado a esta alerta.' : 'No se pudo registrar la participación.');
    }
    fetchAlertas();
  };

  const toggleEstado = async (alerta: Alerta) => {
    const { error: updateError } = await supabase.from('alertas').update({ estado: alerta.estado === 'activa' ? 'inactiva' : 'activa' }).eq('id', alerta.id);
    if (updateError) setError('No se pudo actualizar la alerta.');
    fetchAlertas();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error: deleteError } = await supabase.from('alertas').delete().eq('id', confirmDelete.id);
    if (deleteError) setError('No se pudo eliminar la alerta.');
    else setConfirmDelete(null);
    fetchAlertas();
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  const activas = alertas.filter((alerta) => alerta.estado === 'activa');
  const inactivas = alertas.filter((alerta) => alerta.estado === 'inactiva');

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Alertas de Emergencia</h1>
        {isStaff && <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={18} /> Nueva</button>}
      </div>
      {error && <div className="mb-4 text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3 flex items-center justify-between">{error}<button onClick={() => setError(null)}><X size={16} /></button></div>}

      {activas.length > 0 && <div className="mb-6"><h2 className="text-sm font-semibold text-error-600 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-error-500 animate-pulse-alert" />Alertas activas ({activas.length})</h2><div className="space-y-3">{activas.map((alerta) => <AlertaCard key={alerta.id} alerta={alerta} isStaff={isStaff} onToggleParticipation={() => toggleParticipation(alerta)} onToggleEstado={() => toggleEstado(alerta)} onDelete={() => setConfirmDelete(alerta)} />)}</div></div>}
      {inactivas.length > 0 && <div className="mb-6"><h2 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2"><Activity size={16} /> Histórico ({inactivas.length})</h2><div className="space-y-2">{inactivas.map((alerta) => <AlertaCard key={alerta.id} alerta={alerta} isStaff={isStaff} onToggleParticipation={() => {}} onToggleEstado={() => toggleEstado(alerta)} onDelete={() => setConfirmDelete(alerta)} inactive />)}</div></div>}
      {alertas.length === 0 && <EmptyState icon={Siren} title="No hay alertas" description={isStaff ? 'Crea una alerta de emergencia para notificar a todos los voluntarios.' : 'No hay alertas de emergencia.'} action={isStaff ? <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={18} /> Crear alerta</button> : undefined} />}
      {showCreate && <CreateAlertaModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchAlertas(); }} />}
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete} title="Eliminar alerta" message="¿Seguro que quieres eliminar esta alerta permanentemente?" confirmText="Eliminar" danger />
    </div>
  );
}

function AlertaCard({ alerta, isStaff, onToggleParticipation, onToggleEstado, onDelete, inactive = false }: { alerta: AlertaWithResponses; isStaff: boolean; onToggleParticipation: () => void; onToggleEstado: () => void; onDelete: () => void; inactive?: boolean }) {
  const cfg = nivelConfig[alerta.nivel] ?? nivelConfig.bajo;
  return <div className={`${inactive ? 'card opacity-70' : `rounded-2xl border-2 ${cfg.border} ${cfg.bg} animate-slide-up`} p-4`}>
    <div className="flex items-start justify-between mb-2"><div className="flex items-center gap-2"><AlertTriangle size={20} className={cfg.icon} /><h3 className="font-bold text-gray-900">{alerta.titulo}</h3></div><Badge variant={inactive ? 'gray' : cfg.variant}>{cfg.label}</Badge></div>
    {alerta.descripcion && <p className="text-sm text-gray-700 mb-3">{alerta.descripcion}</p>}
    <div className="space-y-1.5">{alerta.operativa && <div className="flex items-center gap-2 text-sm text-gray-600"><Radio size={14} className="text-gray-400" /><span className="font-medium">Operativa:</span> {alerta.operativa}</div>}{alerta.punto_encuentro && <div className="flex items-center gap-2 text-sm text-gray-600"><MapPin size={14} className="text-gray-400" /><span className="font-medium">Punto de encuentro:</span> {alerta.punto_encuentro}</div>}</div>
    <div className="mt-3 pt-3 border-t border-gray-200/50"><div className="flex items-center justify-between gap-2"><span className="text-xs text-gray-400">{new Date(alerta.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><div className="flex gap-2"><button onClick={() => shareOnWhatsApp(buildAlertaShareText(alerta))} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 font-medium flex items-center gap-1"><Share2 size={14} /> WhatsApp</button>{!inactive && <button onClick={onToggleParticipation} className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 ${alerta.my_response ? 'bg-success-500 text-white' : 'bg-white border border-success-200 text-success-700 hover:bg-success-50'}`}><Check size={14} />{alerta.my_response ? 'Apuntado' : 'Participar'}</button>}{isStaff && <><button onClick={onToggleEstado} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium">{inactive ? 'Reactivar' : 'Desactivar'}</button><button onClick={onDelete} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-error-200 text-error-600 hover:bg-error-50 font-medium">Eliminar</button></>}</div></div><p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><Check size={13} className="text-success-600" /> Participantes: {alerta.respuestas.length}</p>{alerta.respuestas.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{alerta.respuestas.map((respuesta) => <Badge key={respuesta.id} variant="success">{respuesta.profile?.nombre} {respuesta.profile?.apellidos}</Badge>)}</div>}</div>
  </div>;
}

function CreateAlertaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [nivel, setNivel] = useState<'bajo' | 'medio' | 'alto' | 'critico'>('medio');
  const [operativa, setOperativa] = useState('');
  const [puntoEncuentro, setPuntoEncuentro] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true); setError(null);
    const { error: insertError } = await supabase.from('alertas').insert({ titulo, descripcion: descripcion || null, nivel, operativa: operativa || null, punto_encuentro: puntoEncuentro || null, estado: 'activa', created_by: user.id });
    if (insertError) setError('No se pudo crear la alerta.'); else { await processPendingPushNotifications(); onCreated(); }
    setLoading(false);
  };

  return <Modal open onClose={onClose} title="Nueva alerta de emergencia" size="lg"><form onSubmit={handleSubmit} className="space-y-4"><div><label className="label">Título</label><input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ej: Inundación en zona centro" /></div><div><label className="label">Descripción</label><textarea className="input min-h-[80px]" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles de la emergencia..." /></div><div><label className="label">Nivel de alerta</label><div className="grid grid-cols-4 gap-2">{(['bajo', 'medio', 'alto', 'critico'] as const).map((nivelItem) => { const cfg = nivelConfig[nivelItem]; return <button key={nivelItem} type="button" onClick={() => setNivel(nivelItem)} className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${nivel === nivelItem ? `${cfg.border} ${cfg.bg} ${cfg.icon}` : 'border-gray-200 bg-white text-gray-400'}`}>{cfg.label}</button>; })}</div></div><div><label className="label">Operativa</label><input className="input" value={operativa} onChange={(e) => setOperativa(e.target.value)} placeholder="Ej: Evacuación de residentes" /></div><div><label className="label">Punto de encuentro</label><input className="input" value={puntoEncuentro} onChange={(e) => setPuntoEncuentro(e.target.value)} placeholder="Ej: Polideportivo Marismas del Domingo" /></div>{error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3">{error}</div>}<div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="btn-outline flex-1">Cancelar</button><button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Creando...' : 'Activar alerta'}</button></div></form></Modal>;
}
