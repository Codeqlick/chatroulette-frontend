import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuthStore, useAuthHydrated } from '@application/stores/auth-store';
import { tokenRefreshService } from '@infrastructure/auth/token-refresh-service';
import { logger } from '@infrastructure/logging/frontend-logger';

// Lazy load pages for code splitting
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((module) => ({ default: module.LandingPage }))
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((module) => ({ default: module.LoginPage }))
);
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage }))
);
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage }))
);
const VideochatPage = lazy(() =>
  import('./pages/VideochatPage').then((module) => ({ default: module.VideochatPage }))
);
const ChatPage = lazy(() =>
  import('./pages/ChatPage').then((module) => ({ default: module.ChatPage }))
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage }))
);
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage }))
);
const BannedPage = lazy(() =>
  import('./pages/BannedPage').then((module) => ({ default: module.BannedPage }))
);

// Loading component
function LoadingSpinner(): JSX.Element {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

function App(): JSX.Element {
  // Initialize theme hook to ensure theme is applied
  useTheme();

  // Initialize token refresh service
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthHydrated();

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (isAuthenticated) {
      // Start token refresh service when user is authenticated
      tokenRefreshService.start();
      logger.debug('Token refresh service started');
    } else {
      // Stop token refresh service when user is not authenticated
      tokenRefreshService.stop();
      logger.debug('Token refresh service stopped');
    }

    // Cleanup on unmount or when authentication changes
    return () => {
      if (!isAuthenticated) {
        tokenRefreshService.stop();
      }
    };
  }, [isAuthenticated, hasHydrated]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/videochat"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <VideochatPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:sessionId"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:username"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/banned" element={<BannedPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
