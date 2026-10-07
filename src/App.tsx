import { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ServiciosPage } from '@/pages/ServiciosPage';
import { AlertasPage } from '@/pages/AlertasPage';
import { ReunionesPage } from '@/pages/ReunionesPage';
import { PerfilPage } from '@/pages/PerfilPage';
import { AcreditacionPage } from '@/pages/AcreditacionPage';
import { IncidenciasPage } from '@/pages/IncidenciasPage';
import { MapaOperativoPage } from '@/pages/MapaOperativoPage';
import { AsistenciasPage } from '@/pages/AsistenciasPage';
import { Layout } from '@/components/Layout';
import { FullScreenSpinner } from '@/components/ui/Spinner';

export type Page = 'dashboard' | 'servicios' | 'alertas' | 'reuniones' | 'perfil' | 'acreditacion' | 'incidencias' | 'mapa' | 'asistencias';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');

  if (loading) return <FullScreenSpinner />;

  if (!user || !profile) return <LoginPage />;

  if (!profile.is_active || (profile.role === 'voluntario' && !profile.is_approved)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-warning-100 flex items-center justify-center mb-4">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">
          {profile.role === 'voluntario' && !profile.is_approved ? 'Cuenta pendiente de aprobación' : 'Cuenta inactiva'}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {profile.role === 'voluntario' && !profile.is_approved
            ? 'Tu cuenta está pendiente de aprobación por un coordinador o administrador técnico. Recibirás una notificación cuando sea aprobada.'
            : 'Tu cuenta ha sido desactivada. Contacta con el coordinador o administrador técnico.'}
        </p>
        <InactiveSignOut />
      </div>
    );
  }

  return (
    <NotificationProvider>
      <Layout current={page} onNavigate={setPage}>
        {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
        {page === 'servicios' && <ServiciosPage />}
        {page === 'alertas' && <AlertasPage />}
        {page === 'reuniones' && <ReunionesPage />}
        {page === 'perfil' && <PerfilPage />}
        {page === 'acreditacion' && <AcreditacionPage />}
        {page === 'incidencias' && <IncidenciasPage />}
        {page === 'mapa' && <MapaOperativoPage />}
        {page === 'asistencias' && profile && (profile.role === 'admin_tecnico' || profile.role === 'coordinador') && <AsistenciasPage />}
      </Layout>
    </NotificationProvider>
  );
}

function InactiveSignOut() {
  const { signOut } = useAuth();
  return (
    <button onClick={signOut} className="btn-outline">
      Cerrar sesión
    </button>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
