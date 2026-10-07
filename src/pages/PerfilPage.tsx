import { useEffect, useState, useCallback } from 'react';
import { User, Phone, Mail, Shield, Users, Check, X, ChevronRight, Lock, UserPlus, Clock, Bell, BellOff, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { supabase, type GroupingRole, type Profile, type UserRole } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

const roleConfig: Record<string, { label: string; variant: 'primary' | 'accent' | 'gray' }> = {
  admin_tecnico: { label: 'Admin Técnico', variant: 'accent' },
  coordinador: { label: 'Coordinador', variant: 'primary' },
  voluntario: { label: 'Voluntario', variant: 'gray' },
};

const groupingRoleLabels: Record<GroupingRole, string> = {
  jefe_agrupacion: 'Jefe de Agrupación',
  subjefe_agrupacion: 'Subjefe de Agrupación',
  responsable_logistica: 'Responsable Sección Logística',
  responsable_sanitaria: 'Responsable Sección Sanitaria',
  responsable_parque_movil: 'Responsable Sección Parque Móvil',
  responsable_tecnologia_telecomunicaciones: 'Responsable Sección Tecnológica y Telecomunicaciones',
  voluntario: 'Voluntario',
};

const especialidades = [
  'Auxilio Sanitario',
  'Rescate y Salvamento',
  'Logística',
  'Comunicaciones',
  'Transporte',
  'Drones',
  'Intervención Multital',
];

export function PerfilPage() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [loading, setLoading] = useState(false);

  const [nombre, setNombre] = useState(profile?.nombre ?? '');
  const [apellidos, setApellidos] = useState(profile?.apellidos ?? '');
  const [telefono, setTelefono] = useState(profile?.telefono ?? '');
  const [especialidad, setEspecialidad] = useState(profile?.especialidad ?? '');
  const [error, setError] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin_tecnico' || profile?.role === 'coordinador';

  useEffect(() => {
    if (profile) {
      setNombre(profile.nombre);
      setApellidos(profile.apellidos);
      setTelefono(profile.telefono ?? '');
      setEspecialidad(profile.especialidad ?? '');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        nombre,
        apellidos,
        telefono: telefono || null,
        especialidad: especialidad || null,
      })
      .eq('id', user.id);
    if (error) setError(error.message);
    else {
      await refreshProfile();
      setEditing(false);
    }
    setLoading(false);
  };

  if (!profile) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  const roleCfg = roleConfig[profile.role] ?? roleConfig.voluntario;
  const initials = `${profile.nombre?.[0] ?? ''}${profile.apellidos?.[0] ?? ''}`.toUpperCase();

  const staffRoleLabel = profile.role === 'coordinador' ? 'Administrador Técnico' : 'Coordinador';
  const staffRole: UserRole = profile.role === 'coordinador' ? 'admin_tecnico' : 'coordinador';

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Profile Card */}
      <div className="card p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center text-xl font-bold text-primary-700">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900">{profile.nombre} {profile.apellidos}</h1>
            <Badge variant={roleCfg.variant} className="mt-1">{roleCfg.label}</Badge>
          </div>
        </div>

        <div className="space-y-3">
          <InfoRow icon={Mail} label="Email" value={profile.email} />
          {profile.indicativo && <InfoRow icon={Shield} label="Indicativo" value={profile.indicativo} />}
          {profile.especialidad && <InfoRow icon={User} label="Especialidad" value={profile.especialidad} />}
          {profile.telefono && <InfoRow icon={Phone} label="Teléfono" value={profile.telefono} />}
          <InfoRow icon={Check} label="Estado" value={profile.is_active ? 'Activo' : 'Inactivo'} />
        </div>

        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn-outline w-full mt-4">
            Editar perfil
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="label">Apellidos</label>
              <input className="input" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="600 123 456" />
            </div>
            {profile.role === 'voluntario' && (
              <div>
                <label className="label">Especialidad</label>
                <select className="input" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)}>
                  <option value="">Sin especialidad</option>
                  {especialidades.map((esp) => (
                    <option key={esp} value={esp}>{esp}</option>
                  ))}
                </select>
              </div>
            )}
            {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3">{error}</div>}
            <div className="flex gap-3">
              <button onClick={() => setEditing(false)} className="btn-outline flex-1">Cancelar</button>
              <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Staff Section */}
      {isStaff && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Users size={18} className="text-accent-500" /> Gestión de usuarios
          </h2>
          <button onClick={() => setShowPending(true)} className="btn-ghost w-full justify-between">
            <span className="flex items-center gap-2"><Clock size={16} /> Aprobaciones pendientes</span>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setShowUsers(true)} className="btn-ghost w-full justify-between">
            <span>Ver y gestionar usuarios</span>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setShowCreateStaff(true)} className="btn-ghost w-full justify-between">
            <span className="flex items-center gap-2"><UserPlus size={16} /> Crear {staffRoleLabel}</span>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {profile.role === 'admin_tecnico' && <AppLinkSettings />}

      {/* Push Notifications */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Bell size={18} className="text-primary-600" /> Notificaciones push
        </h2>
        <PushNotificationCard />
      </div>

      {/* Sign out */}
      <button onClick={signOut} className="btn-outline w-full text-error-600 border-error-200 hover:bg-error-50">
        <Lock size={18} /> Cerrar sesión
      </button>

      {showUsers && <UsersManagementModal onClose={() => setShowUsers(false)} />}
      {showPending && <PendingApprovalsModal onClose={() => setShowPending(false)} />}
      {showCreateStaff && (
        <CreateStaffModal
          onClose={() => setShowCreateStaff(false)}
          role={staffRole}
          roleLabel={staffRoleLabel}
        />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}

function PendingApprovalsModal({ onClose }: { onClose: () => void }) {
  const [pending, setPending] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'voluntario')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });
    setPending(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    await supabase.rpc('approve_volunteer', { p_user_id: userId });
    setActionLoading(null);
    fetchPending();
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId);
    await supabase.rpc('reject_volunteer', { p_user_id: userId });
    setActionLoading(null);
    fetchPending();
  };

  return (
    <Modal open onClose={onClose} title="Aprobaciones pendientes" size="lg">
      {loading ? (
        <div className="flex justify-center py-8"><Spinner size={32} /></div>
      ) : pending.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Check size={40} className="mx-auto mb-2 text-success-500" />
          <p className="text-sm">No hay solicitudes pendientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((u) => {
            const initials = `${u.nombre?.[0] ?? ''}${u.apellidos?.[0] ?? ''}`.toUpperCase();
            return (
              <div key={u.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-warning-100 flex items-center justify-center text-xs font-bold text-warning-700">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.nombre} {u.apellidos}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400">{u.email}</span>
                      {u.indicativo && <span className="text-xs text-gray-400">· {u.indicativo}</span>}
                      {u.especialidad && <span className="text-xs text-gray-400">· {u.especialidad}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(u.id)}
                    disabled={actionLoading === u.id}
                    className="p-2 rounded-lg bg-success-50 text-success-600 hover:bg-success-100 transition-colors disabled:opacity-50"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    onClick={() => handleReject(u.id)}
                    disabled={actionLoading === u.id}
                    className="p-2 rounded-lg bg-error-50 text-error-600 hover:bg-error-100 transition-colors disabled:opacity-50"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function UsersManagementModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<Profile | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <Modal open onClose={onClose} title="Gestión de usuarios" size="lg">
      {loading ? (
        <div className="flex justify-center py-8"><Spinner size={32} /></div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const cfg = roleConfig[u.role] ?? roleConfig.voluntario;
            const initials = `${u.nombre?.[0] ?? ''}${u.apellidos?.[0] ?? ''}`.toUpperCase();
            return (
              <div key={u.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                    u.is_active ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.nombre} {u.apellidos}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      {u.indicativo && <span className="text-xs text-gray-400">{u.indicativo}</span>}
                      {!u.is_active && <Badge variant="error">Inactivo</Badge>}
                      {u.role === 'voluntario' && !u.is_approved && u.is_active && <Badge variant="warning">Pendiente</Badge>}
                    </div>
                  </div>
                </div>
                {u.id !== user?.id && (
                  <button
                    onClick={() => setEditUser(u)}
                    className="text-xs text-primary-600 font-medium px-3 py-1.5 rounded-lg hover:bg-primary-50"
                  >
                    Editar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); fetchUsers(); }}
        />
      )}
    </Modal>
  );
}

function EditUserModal({ user: editUser, onClose, onSaved }: {
  user: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile: currentUser } = useAuth();
  const [nombre, setNombre] = useState(editUser.nombre);
  const [apellidos, setApellidos] = useState(editUser.apellidos);
  const [indicativo, setIndicativo] = useState(editUser.indicativo ?? '');
  const [especialidad, setEspecialidad] = useState(editUser.especialidad ?? '');
  const [telefono, setTelefono] = useState(editUser.telefono ?? '');
  const [role, setRole] = useState<UserRole>(editUser.role);
  const [groupingRole, setGroupingRole] = useState<GroupingRole>(editUser.agrupacion_role ?? 'voluntario');
  const [isActive, setIsActive] = useState(editUser.is_active);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditRole = currentUser?.role === 'admin_tecnico';

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('admin-user', {
      body: {
        action: 'update',
        userId: editUser.id,
        role,
        isActive,
        isApproved: editUser.is_approved,
        nombre,
        apellidos,
        indicativo: indicativo || null,
        especialidad: especialidad || null,
        telefono: telefono || null,
      },
    });
    if (invokeError || data?.error) {
      setError('No se pudo guardar el usuario.');
      setLoading(false);
      return;
    }
    const { error: groupingError } = await supabase.rpc('set_agrupacion_role', {
      p_user_id: editUser.id,
      p_agrupacion_role: groupingRole,
    });
    if (groupingError) {
      setError('Los datos se guardaron, pero no se pudo actualizar el cargo.');
      setLoading(false);
      return;
    }
    if (password) {
      const { data: passwordData, error: passwordError } = await supabase.functions.invoke('admin-user', {
        body: { action: 'password', userId: editUser.id, password },
      });
      if (passwordError || passwordData?.error) {
        setError('Los datos se guardaron, pero no se pudo cambiar la contraseña.');
        setLoading(false);
        return;
      }
    }
    onSaved();
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Seguro que quieres eliminar este usuario? Esta acción no se puede deshacer.')) return;
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('admin-user', {
      body: { action: 'delete', userId: editUser.id },
    });
    if (invokeError || data?.error) {
      setError('No se pudo eliminar el usuario.');
      setLoading(false);
      return;
    }
    onSaved();
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Editar: ${editUser.nombre} ${editUser.apellidos}`} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><label className="label">Apellidos</label><input className="input" value={apellidos} onChange={(e) => setApellidos(e.target.value)} /></div>
        </div>
        <div><label className="label">Indicativo</label><input className="input" value={indicativo} onChange={(e) => setIndicativo(e.target.value)} /></div>
        <div><label className="label">Especialidad</label><select className="input" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)}><option value="">Sin especialidad</option>{especialidades.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div><label className="label">Teléfono</label><input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
        <div>
          <label className="label">Rol</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={!canEditRole}
          >
            <option value="voluntario">Voluntario</option>
            <option value="coordinador">Coordinador</option>
            <option value="admin_tecnico">Administrador Técnico</option>
          </select>
          {!canEditRole && (
            <p className="text-xs text-gray-400 mt-1">Solo el administrador técnico puede cambiar roles</p>
          )}
        </div>
        <div>
          <label className="label">Cargo en la agrupación</label>
          <select className="input" value={groupingRole} onChange={(e) => setGroupingRole(e.target.value as GroupingRole)}>
            {(Object.keys(groupingRoleLabels) as GroupingRole[]).map((item) => <option key={item} value={item}>{groupingRoleLabels[item]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Estado</label>
          <div className="flex gap-2">
            <button
              onClick={() => setIsActive(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                isActive ? 'border-success-300 bg-success-50 text-success-700' : 'border-gray-200 text-gray-400'
              }`}
            >
              <Check size={16} className="inline mr-1" /> Activo
            </button>
            <button
              onClick={() => setIsActive(false)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                !isActive ? 'border-error-300 bg-error-50 text-error-700' : 'border-gray-200 text-gray-400'
              }`}
            >
              <X size={16} className="inline mr-1" /> Inactivo
            </button>
          </div>
        </div>
        <div><label className="label">Nueva contraseña <span className="text-gray-400 font-normal">(opcional)</span></label><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} placeholder="Mínimo 6 caracteres" /></div>
        {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={loading} className="btn-primary flex-1">
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
        <button onClick={handleDelete} disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-medium text-error-600 bg-error-50 border border-error-200 hover:bg-error-100 disabled:opacity-50"><Trash2 size={16} className="inline mr-1" /> Eliminar usuario</button>
      </div>
    </Modal>
  );
}

function CreateStaffModal({ onClose, role, roleLabel }: {
  onClose: () => void;
  role: UserRole;
  roleLabel: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc('create_staff_account', {
      p_email: email,
      p_password: password,
      p_nombre: nombre,
      p_apellidos: apellidos,
      p_role: role,
      p_telefono: telefono || null,
    });
    if (error) setError(error.message);
    else {
      setSuccess(true);
      setEmail(''); setPassword(''); setNombre(''); setApellidos(''); setTelefono('');
    }
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title={`Crear ${roleLabel}`} size="md">
      {success ? (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-success-100 flex items-center justify-center mx-auto mb-3">
            <Check size={28} className="text-success-600" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">{roleLabel} creado correctamente</p>
          <p className="text-xs text-gray-400 mb-4">La nueva cuenta ya puede iniciar sesión.</p>
          <button onClick={onClose} className="btn-primary">Cerrar</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div>
              <label className="label">Apellidos</label>
              <input className="input" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input type="text" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="600 123 456" />
          </div>
          {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3">{error}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-outline flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Creando...' : `Crear ${roleLabel}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function AppLinkSettings() {
  const [appUrl, setAppUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from('app_settings').select('app_url').eq('setting_key', 'public_app').maybeSingle().then(({ data }) => {
      if (active) {
        setAppUrl(data?.app_url ?? '');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    const { error: saveError } = await supabase.rpc('update_app_url', { p_app_url: appUrl.trim() });
    if (saveError) setError('No se pudo guardar el enlace. Usa una dirección que empiece por https://.');
    else setMessage('Enlace guardado. Se utilizará al compartir servicios.');
    setSaving(false);
  };

  return (
    <div className="card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Enlace público de la aplicación</h2>
      <p className="text-xs text-gray-500">Este enlace aparece en los mensajes de WhatsApp de los servicios.</p>
      <input className="input" value={appUrl} onChange={(event) => setAppUrl(event.target.value)} disabled={loading} placeholder="https://..." inputMode="url" />
      {error && <p className="text-sm text-error-600 bg-error-50 rounded-xl px-3 py-2">{error}</p>}
      {message && <p className="text-sm text-success-700 bg-success-50 rounded-xl px-3 py-2">{message}</p>}
      <button onClick={handleSave} disabled={loading || saving} className="btn-primary w-full">{saving ? 'Guardando...' : 'Guardar enlace'}</button>
    </div>
  );
}

function PushNotificationCard() {
  const { pushEnabled, pushSupported, enablePush, disablePush } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    setBusy(true);
    setError(null);
    if (pushEnabled) {
      await disablePush();
    } else {
      const ok = await enablePush();
      if (!ok) setError('No se pudo activar. Verifica que has concedido permiso de notificaciones.');
    }
    setBusy(false);
  };

  if (!pushSupported) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <BellOff size={18} />
        <span>Las notificaciones push no están disponibles en este dispositivo.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Recibe alertas de emergencia, nuevos servicios y reuniones directamente en tu dispositivo, incluso con la app cerrada.
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pushEnabled ? (
            <Badge variant="success">Activado</Badge>
          ) : (
            <Badge variant="gray">Desactivado</Badge>
          )}
        </div>
        <button
          onClick={handleToggle}
          disabled={busy}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${
            pushEnabled
              ? 'bg-error-50 text-error-600 border border-error-200 hover:bg-error-100'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {busy ? 'Procesando...' : pushEnabled ? 'Desactivar' : 'Activar notificaciones'}
        </button>
      </div>
      {error && <div className="text-sm text-error-600 bg-error-50 rounded-xl px-4 py-3">{error}</div>}
    </div>
  );
}
