import { useEffect, useRef, useState } from 'react';
import { Camera, Check, CreditCard, Save, ShieldCheck, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type GroupingRole } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';

const groupingRoleLabels: Record<GroupingRole, string> = {
  jefe_agrupacion: 'Jefe de Agrupación',
  subjefe_agrupacion: 'Subjefe de Agrupación',
  responsable_logistica: 'Responsable Sección Logística',
  responsable_sanitaria: 'Responsable Sección Sanitaria',
  responsable_parque_movil: 'Responsable Sección Parque Móvil',
  responsable_tecnologia_telecomunicaciones: 'Responsable Sección Tecnológica y Telecomunicaciones',
  voluntario: 'Voluntario',
};

export function AcreditacionPage() {
  const { profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dni, setDni] = useState(profile?.dni ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDni(profile?.dni ?? '');
  }, [profile?.dni]);

  useEffect(() => {
    let cancelled = false;
    async function loadPhoto() {
      if (!profile?.avatar_url) {
        setPhotoUrl(null);
        return;
      }
      const { data } = await supabase.storage.from('accreditation-photos').createSignedUrl(profile.avatar_url, 3600);
      if (!cancelled) setPhotoUrl(data?.signedUrl ?? null);
    }
    loadPhoto();
    return () => { cancelled = true; };
  }, [profile?.avatar_url]);

  if (!profile) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: saveError } = await supabase.from('profiles').update({ dni: dni.trim() || null }).eq('id', profile.id);
    if (saveError) setError('No se pudieron guardar los datos.');
    else {
      await refreshProfile();
      setMessage('Datos guardados correctamente.');
    }
    setSaving(false);
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('La foto debe ser JPG, PNG o WebP y pesar menos de 5 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('accreditation-photos').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setError('No se pudo subir la foto.');
      setUploading(false);
      return;
    }
    const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', profile.id);
    if (profileError) {
      await supabase.storage.from('accreditation-photos').remove([path]);
      setError('No se pudo guardar la foto.');
      setUploading(false);
      return;
    }
    await refreshProfile();
    setMessage('Foto actualizada correctamente.');
    setUploading(false);
  };

  return (
    <div className="px-4 py-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard size={22} className="text-primary-600" />
        <div><h1 className="text-xl font-bold text-gray-900">Acreditación</h1><p className="text-xs text-gray-500">Identificación de la Agrupación</p></div>
      </div>

      <div className="rounded-3xl overflow-hidden shadow-lg border border-gray-200 bg-white">
        <div className="bg-primary-900 px-5 py-4 flex items-center justify-between gap-3">
          <img src="/assets/logos/ayuntamientologo.png" alt="Ayuntamiento de Huelva" className="h-12 w-auto object-contain bg-white rounded-lg p-1" />
          <div className="text-right text-white"><p className="text-[10px] uppercase tracking-[0.18em] text-primary-200">Agrupación</p><p className="font-bold text-sm">Protección Civil Huelva</p></div>
        </div>
        <div className="bg-white px-5 pt-5 pb-6">
          <div className="flex justify-center mb-4"><img src="/assets/logos/HUELVA.png" alt="Protección Civil Huelva" className="h-24 w-auto object-contain" /></div>
          <div className="flex items-center gap-4 border-t border-gray-100 pt-5">
            <div className="relative w-28 h-36 rounded-xl overflow-hidden bg-gray-100 border-2 border-primary-100 flex items-center justify-center flex-shrink-0">
              {photoUrl ? <img src={photoUrl} alt="Fotografía de acreditación" className="w-full h-full object-cover" /> : <div className="text-center text-gray-400"><Camera size={28} className="mx-auto mb-1" /><span className="text-[10px]">Sin foto</span></div>}
              <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center shadow-md hover:bg-primary-800" aria-label="Cambiar fotografía"><Upload size={15} /></button>
            </div>
            <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-widest text-gray-400">Voluntario/a</p><h2 className="text-lg font-bold text-gray-900 leading-tight">{profile.nombre} {profile.apellidos}</h2><div className="mt-3 space-y-1.5 text-sm"><p><span className="text-gray-400">Indicativo:</span> <strong className="text-gray-800">{profile.indicativo || 'Sin asignar'}</strong></p><p><span className="text-gray-400">Cargo:</span> <strong className="text-primary-700">{groupingRoleLabels[profile.agrupacion_role] ?? groupingRoleLabels.voluntario}</strong></p></div></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">DNI</p><p className="text-sm font-semibold text-gray-800 mt-1">{profile.dni || 'Pendiente de completar'}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Estado</p><p className="text-sm font-semibold text-success-700 mt-1 flex items-center gap-1"><ShieldCheck size={15} /> Activo</p></div></div>
          <p className="text-[10px] text-gray-400 text-center mt-5">Documento interno de identificación · Protección Civil Huelva</p>
        </div>
      </div>

      <div className="card p-4 mt-4 space-y-3"><h2 className="text-sm font-semibold text-gray-900">Completar acreditación</h2><div><label className="label">DNI</label><input className="input" value={dni} onChange={(event) => setDni(event.target.value)} placeholder="12345678A" maxLength={20} /></div><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="hidden" />{error && <p className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</p>}{message && <p className="text-sm text-success-700 bg-success-50 rounded-xl px-3 py-2 flex items-center gap-2"><Check size={16} />{message}</p>}<div className="flex gap-2"><button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-outline flex-1">{uploading ? 'Subiendo...' : 'Añadir foto'}</button><button onClick={handleSave} disabled={saving} className="btn-primary flex-1"><Save size={16} />{saving ? 'Guardando...' : 'Guardar DNI'}</button></div></div>
    </div>
  );
}
