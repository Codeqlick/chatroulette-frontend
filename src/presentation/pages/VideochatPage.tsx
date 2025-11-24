import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuthStore, useAuthHydrated } from '@application/stores/auth-store';
import { useChatStore } from '@application/stores/chat-store';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { matchingService } from '@infrastructure/api/matching-service';
import { sessionService } from '@infrastructure/api/session-service';
import { WEBSOCKET_EVENTS } from '@config/constants';
import { ThemeToggle } from '../components/ThemeToggle';
import { ChatWindow } from '../components/ChatWindow';
import { Button } from '../components/Button';

export function VideochatPage(): JSX.Element {
  const navigate = useNavigate();
  const { user, accessToken, isAuthenticated, logout } = useAuthStore();
  const hasHydrated = useAuthHydrated();
  const { setSession, partner, sessionId, clearSession } = useChatStore();
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [hasCheckedStatus, setHasCheckedStatus] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasClearedSessionRef = useRef(false);

  const startMatching = useCallback(async (): Promise<void> => {
    setError(null);
    setIsSearching(true);

    try {
      await matchingService.start();
      // Matching worker will emit match:found event when match is found
    } catch (err) {
      setIsSearching(false);
      
      // Check if error is due to active session (409 Conflict)
      if (err instanceof AxiosError && err.response?.status === 409) {
        // User has active session, check status and load it
        try {
          const status = await matchingService.getStatus();
          if (status.status === 'matched' && status.sessionId) {
            setIsLoadingSession(true);
            try {
              const details = await sessionService.getSessionDetails(status.sessionId);
              setSession(details.sessionId, details.partner);
              setIsLoadingSession(false);
            } catch (sessionErr) {
              console.error('Error loading session details:', sessionErr);
              setIsLoadingSession(false);
              setError('Error al cargar la sesión activa.');
            }
            return;
          }
          setError('Ya tienes una sesión activa o estás en la cola de búsqueda.');
        } catch (statusErr) {
          setError('Ya tienes una sesión activa. Por favor, termina la sesión actual primero.');
        }
        return;
      }
      
      setError('Error al iniciar búsqueda. Intenta nuevamente.');
    }
  }, [setSession]);

  // Wait for zustand persist to hydrate
  useEffect(() => {
    if (hasHydrated) {
      // Small delay after hydration to ensure state is ready
      const initTimer = setTimeout(() => {
        setIsInitializing(false);
      }, 100);

      return () => clearTimeout(initTimer);
    }
    return undefined;
  }, [hasHydrated]);

  // Update WebSocket when accessToken changes (only after initialization is complete)
  useEffect(() => {
    if (isInitialized && !isInitializing && isAuthenticated && accessToken) {
      // Update WebSocket token if it changed, but only after initial setup
      webSocketService.updateToken(accessToken);
    }
  }, [accessToken, isAuthenticated, isInitializing, isInitialized]);

  useEffect(() => {
    // Wait for initial state hydration
    if (isInitializing) {
      return;
    }

    // Authentication is now handled by ProtectedRoute, so we can assume user is authenticated here
    if (!isAuthenticated || !accessToken) {
      // This should not happen due to ProtectedRoute, but keep as safety check
      console.warn('[VideochatPage] User not authenticated, but ProtectedRoute should have handled this');
      return;
    }

    // Limpiar estado de chat solo una vez al inicializar para evitar mostrar datos de sesiones anteriores
    if (!hasClearedSessionRef.current) {
      clearSession();
      hasClearedSessionRef.current = true;
    }

    // Additional check: if user is null but we have accessToken, there might be a state issue
    // But don't block initialization, just log a warning
    let retryTimer: NodeJS.Timeout | undefined;
    if (!user && accessToken) {
      console.warn('[VideochatPage] User is null but accessToken exists, this might indicate a state hydration issue');
      // Give it a moment and check again, but don't block
      retryTimer = setTimeout(() => {
        if (!user) {
          console.warn('[VideochatPage] User still null after retry, but continuing anyway');
          // Don't set error, just continue - the user might load later
        }
      }, 1000); // Reduced timeout
      // Don't return early, continue with initialization
    }

    // Safety timeout to ensure hasCheckedStatus is always set (reduced to 5 seconds)
    const safetyTimeout = setTimeout(() => {
      if (!hasCheckedStatus) {
        console.warn('[VideochatPage] Initialization timeout reached, setting hasCheckedStatus to true');
        setHasCheckedStatus(true);
        setIsInitialized(true);
        // Don't set error immediately, let it try to continue
      }
    }, 5000); // Reduced from 10 to 5 seconds

    // Connect WebSocket
    try {
    webSocketService.connect(accessToken);
    } catch (err) {
      console.error('Error connecting WebSocket:', err);
      setInitializationError('Error al conectar con el servidor. Por favor, recarga la página.');
      setHasCheckedStatus(true);
      clearTimeout(safetyTimeout);
      return;
    }

    // Check for active session or matching status
    const checkStatus = async (): Promise<void> => {
      try {
        console.log('[VideochatPage] Checking matching status...');
        const status = await matchingService.getStatus();
        console.log('[VideochatPage] Matching status:', status);
        
        if (status.status === 'matched' && status.sessionId) {
          // User has an active session, load it
          setIsLoadingSession(true);
          try {
            const details = await sessionService.getSessionDetails(status.sessionId);
            setSession(details.sessionId, details.partner);
            setIsLoadingSession(false);
            setHasCheckedStatus(true);
            setIsInitialized(true);
            clearTimeout(safetyTimeout);
            console.log('[VideochatPage] Session loaded successfully');
          } catch (err) {
            console.error('[VideochatPage] Error loading session details:', err);
            setIsLoadingSession(false);
            clearSession();
            setHasCheckedStatus(true);
            setIsInitialized(true);
            clearTimeout(safetyTimeout);
            // Don't set error, just continue to matching
            await startMatching();
          }
          return;
        }
        if (status.status === 'searching') {
          // User is already searching
          console.log('[VideochatPage] User is already searching');
          setIsSearching(true);
          setHasCheckedStatus(true);
          setIsInitialized(true);
          clearTimeout(safetyTimeout);
        } else {
          // No active session and not searching, start matching automatically
          console.log('[VideochatPage] No active session, starting matching');
          setHasCheckedStatus(true);
          setIsInitialized(true);
          clearTimeout(safetyTimeout);
          await startMatching();
        }
      } catch (err) {
        // Ensure hasCheckedStatus is set even on error
        console.error('[VideochatPage] Error checking matching status:', err);
        setHasCheckedStatus(true);
        setIsInitialized(true);
        clearTimeout(safetyTimeout);
        // Try to start matching anyway
        try {
          console.log('[VideochatPage] Attempting to start matching after error');
        await startMatching();
        } catch (matchingErr) {
          console.error('[VideochatPage] Error starting matching:', matchingErr);
          // Don't set initializationError, just set error for user to retry
          setError('Error al iniciar la búsqueda. Por favor, intenta nuevamente.');
        }
      }
    };

    // Listen for match found
    const handleMatchFound = (...args: unknown[]): void => {
      const data = args[0] as {
        sessionId: string;
        partner: { id: string; name: string; avatar: string | null };
      };
      setIsSearching(false);
      setSession(data.sessionId, data.partner);
    };

    const handleMatchTimeout = (...args: unknown[]): void => {
      const data = args[0] as {
        reason: string;
        message: string;
      } | undefined;
      
      setIsSearching(false);
      setError(
        data?.message ?? 'No se encontró ningún usuario disponible. Intenta nuevamente.'
      );
    };

    // Listen for session ended
    const handleSessionEnded = (...args: unknown[]): void => {
      const data = args[0] as { sessionId: string };
      if (data.sessionId === sessionId) {
        clearSession();
        setIsSearching(false);
        // Restart matching automatically when session ends
        startMatching();
      }
    };

    webSocketService.on(WEBSOCKET_EVENTS.MATCH_FOUND, handleMatchFound);
    webSocketService.on(WEBSOCKET_EVENTS.MATCH_TIMEOUT, handleMatchTimeout);
    webSocketService.on(WEBSOCKET_EVENTS.SESSION_ENDED, handleSessionEnded);

    checkStatus();

    return () => {
      clearTimeout(safetyTimeout);
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      webSocketService.off(WEBSOCKET_EVENTS.MATCH_FOUND, handleMatchFound);
      webSocketService.off(WEBSOCKET_EVENTS.MATCH_TIMEOUT, handleMatchTimeout);
      webSocketService.off(WEBSOCKET_EVENTS.SESSION_ENDED, handleSessionEnded);
    };
  }, [isAuthenticated, accessToken, navigate, setSession, clearSession, sessionId, startMatching, isInitializing]);

  // Compute ready state - component is ready to show content
  const isReady = useMemo(() => {
    // Must have hydrated and not be initializing
    if (!hasHydrated || isInitializing) {
      return false;
    }
    
    // Must be authenticated with token
    if (!isAuthenticated || !accessToken) {
      return false;
    }
    
    // If we've checked status or initialized, we're ready
    if (hasCheckedStatus || isInitialized) {
      return true;
    }
    
    return false;
  }, [hasHydrated, isInitializing, isAuthenticated, accessToken, hasCheckedStatus, isInitialized]);

  // Debug logging
  console.log('[VideochatPage] Render state:', {
    hasHydrated,
    isInitializing,
    isInitialized,
    isAuthenticated,
    hasAccessToken: !!accessToken,
    hasUser: !!user,
    hasCheckedStatus,
    isLoadingSession,
    hasSession: !!(sessionId && partner),
    initializationError,
    isReady,
  });

  // Show loading while waiting for hydration or initializing
  if (!hasHydrated || isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-400 dark:text-gray-400">
            {!hasHydrated ? 'Cargando...' : 'Inicializando...'}
          </p>
        </div>
      </div>
    );
  }

  // Authentication is handled by ProtectedRoute, so we should always be authenticated here
  // But keep this check as a safety fallback
  if (!isAuthenticated || !accessToken) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-400 dark:text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  // Show initialization error if any (only if it's a critical error and we're ready)
  if (initializationError && isReady && !isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-red-500">
            Error de Inicialización
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            {initializationError}
          </p>
          <div className="flex gap-4 justify-center">
            <Button
              variant="primary"
              size="lg"
              onClick={() => window.location.reload()}
            >
              Recargar Página
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={logout}
            >
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If there's an active session, show ChatWindow
  if (sessionId && partner) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
            <ChatWindow sessionId={sessionId} partner={partner} />
      </div>
    );
  }

  // Show loading state while checking for session
  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-400 dark:text-gray-400">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  // If not ready yet, show loading (but with timeout fallback - will be set by safety timeout)
  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-400 dark:text-gray-400">Conectando...</p>
        </div>
      </div>
    );
  }

  // Show searching state when no active session
  // Use user?.name with fallback in case user is still loading
  // Always render something - this is the final fallback
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center transition-colors">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Chatroulette</h1>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="text-gray-700 dark:text-gray-300">Hola, {user?.name || 'Usuario'}</span>
            {user?.role === 'ADMIN' && (
              <Button variant="primary" size="sm" onClick={() => navigate('/admin')}>
                Panel Admin
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={logout}>
              Cerrar Sesión
            </Button>
          </div>
        </div>

        {/* Searching content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="mb-6">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto"></div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              {isSearching ? 'Buscando chat...' : 'Preparando búsqueda...'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              {isSearching 
                ? 'Estamos buscando alguien con quien puedas chatear. Por favor espera...'
                : 'Preparando la conexión...'}
            </p>

            {(error || initializationError) && (
              <div className="mb-6 bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-lg">
                {error || initializationError}
              </div>
            )}

            {(error || initializationError) && (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  setError(null);
                  setInitializationError(null);
                  startMatching();
                }}
                className="w-full sm:w-auto"
              >
                Intentar de nuevo
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

