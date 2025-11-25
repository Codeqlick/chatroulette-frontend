import { Navigate } from 'react-router-dom';
import { useAuthStore, useAuthHydrated } from '@application/stores/auth-store';
import { useBanStore } from '@application/stores/ban-store';

interface ProtectedRouteProps {
  children: JSX.Element;
}

export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const hasHydrated = useAuthHydrated();
  const isBanned = useBanStore((state) => state.isBanned);

  // Show loading while checking authentication state
  if (!hasHydrated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-400 dark:text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  // Redirect to landing page if not authenticated
  if (!isAuthenticated || !accessToken) {
    return <Navigate to="/" replace />;
  }

  if (isBanned && window.location.pathname !== '/banned') {
    return <Navigate to="/banned" replace />;
  }

  return children;
}

