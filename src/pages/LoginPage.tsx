import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type Mode = 'login' | 'register';

const especialidades = [
  'Auxilio Sanitario',
  'Rescate y Salvamento',
  'Logística',
  'Comunicaciones',
  'Transporte',
  'Drones',
  'Intervención Multital',
];

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [indicativo, setIndicativo] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [telefono, setTelefono] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      if (!indicativo.trim() || !especialidad.trim()) {
        setError('Debes completar el indicativo y la especialidad');
        setLoading(false);
        return;
      }
      const { error } = await signUp({
        email, password, nombre, apellidos,
        indicativo: indicativo || undefined,
        especialidad: especialidad || undefined,
        telefono: telefono || undefined,
      });
      if (error) {
        setError(error);
      } else {
        setError(null);
        setMode('login');
        setEmail('');
        setPassword('');
        setError('Cuenta creada. Un coordinador o administrador debe aprobar tu cuenta antes de poder acceder.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 flex flex-col">
      {/* Header */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8">
        <img
          src="/ayuntamientologo copy.png"
          alt="Ayuntamiento de Huelva"
          className="h-16 w-auto object-contain mb-4 bg-white rounded-xl px-3 py-2"
        />
        <h1 className="text-2xl font-bold text-white text-center">Protección Civil Huelva</h1>
        <p className="text-sm text-primary-200 mt-1 text-center">Agrupación de Voluntarios</p>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-t-3xl px-6 pt-6 pb-8 shadow-2xl animate-slide-up">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all ${
              mode === 'login' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all ${
              mode === 'register' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500'
            }`}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nombre</label>
                  <input
                    className="input"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    placeholder="Juan"
                  />
                </div>
                <div>
                  <label className="label">Apellidos</label>
                  <input
                    className="input"
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    required
                    placeholder="García López"
                  />
                </div>
              </div>

              <div>
                <label className="label">
                  Indicativo <span className="text-error-500">*</span>
                </label>
                <input
                  className="input"
                  value={indicativo}
                  onChange={(e) => setIndicativo(e.target.value)}
                  required
                  placeholder="Ej: H-12"
                />
              </div>
              <div>
                <label className="label">
                  Especialidad <span className="text-error-500">*</span>
                </label>
                <select
                  className="input"
                  value={especialidad}
                  onChange={(e) => setEspecialidad(e.target.value)}
                  required
                >
                  <option value="">Selecciona especialidad</option>
                  {especialidades.map((esp) => (
                    <option key={esp} value={esp}>{esp}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Teléfono</label>
                <input
                  className="input"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="600 123 456"
                />
              </div>
            </>
          )}

          <div>
            <label className="label">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="email"
                className="input pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>

          <div>
            <label className="label">Contraseña</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="input pl-10 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className={`text-sm rounded-xl px-4 py-3 ${
              error.includes('Cuenta creada')
                ? 'bg-success-50 text-success-700 border border-success-200'
                : 'bg-error-50 text-error-600 border border-error-200'
            }`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Procesando...' : mode === 'login' ? (
              <><LogIn size={18} /> Entrar</>
            ) : (
              <><UserPlus size={18} /> Crear cuenta</>
            )}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-4">
          Al continuar aceptas las normas internas de la agrupación.
        </p>
      </div>
    </div>
  );
}
