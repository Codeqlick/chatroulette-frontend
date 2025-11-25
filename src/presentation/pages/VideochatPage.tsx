import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuthStore, useAuthHydrated } from '@application/stores/auth-store';
import { useChatStore } from '@application/stores/chat-store';
import { webSocketService } from '@infrastructure/websocket/websocket-service';
import { matchingService } from '@infrastructure/api/matching-service';
import { sessionService } from '@infrastructure/api/session-service';
import { WEBSOCKET_EVENTS } from '@config/constants';
import { AppHeader } from '../components/AppHeader';
import { ChatWindow } from '../components/ChatWindow';
import { Button } from '../components/Button';
import { SearchingOverlay } from '../components/SearchingOverlay';
import { useWebRTC } from '../hooks/useWebRTC';
import { logger } from '@infrastructure/logging/frontend-logger';

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
  const [autoSearch, setAutoSearch] = useState(true); // Búsqueda automática por defecto
  const [isTransitioning, setIsTransitioning] = useState(false);
  const hasClearedSessionRef = useRef(false);

  // Use WebRTC for local video preview (without sessionId)
  const {
    localStream,
    localVideoRef: webrtcLocalVideoRef,
    startLocalVideo,
    toggleVideo,
    toggleAudio,
    isVideoEnabled,
    isAudioEnabled,
  } = useWebRTC(null);

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

  const handleCancelSearch = useCallback(async (): Promise<void> => {
    setIsSearching(false);
    setError(null);
    try {
      await matchingService.stop();
    } catch (err) {
      logger.error('Error stopping matching', { error: err });
    }
  }, []);

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
              logger.error('Error loading session details', {
                error: sessionErr,
                sessionId: status.sessionId,
              });
              setIsLoadingSession(false);
              setError('Error al cargar la sesión activa.');
            }
            return;
          }
          setError('Ya tienes una sesión activa o estás en la cola de búsqueda.');
        } catch {
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

  // Start local video immediately when ready
  useEffect(() => {
    if (isReady && !sessionId && !localStream) {
      logger.debug('Starting local video preview');
      startLocalVideo().catch((err) => {
        logger.error('Error starting local video', { error: err });
        setError('Error al acceder a la cámara. Por favor, verifica los permisos.');
      });
    }
  }, [isReady, sessionId, localStream, startLocalVideo]);

  // Update WebSocket when accessToken changes (only after initialization is complete)
  useEffect(() => {
    if (isInitialized && !isInitializing && isAuthenticated && accessToken) {
      // Update WebSocket token if it changed, but only after initial setup
      webSocketService.updateToken(accessToken).catch((error) => {
        logger.error('Error updating WebSocket token', { error });
      });
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
      logger.warn('User not authenticated, but ProtectedRoute should have handled this');
      return;
    }

    // Limpiar estado de chat solo una vez al inicializar para evitar mostrar datos de sesiones anteriores
    // Pero NO limpiar si ya hay una sesión activa (por ejemplo, después de recargar)
    if (!hasClearedSessionRef.current && !sessionId) {
      clearSession();
      hasClearedSessionRef.current = true;
    }

    // Additional check: if user is null but we have accessToken, there might be a state issue
    // But don't block initialization, just log a warning
    let retryTimer: NodeJS.Timeout | undefined;
    if (!user && accessToken) {
      logger.warn(
        'User is null but accessToken exists, this might indicate a state hydration issue'
      );
      // Give it a moment and check again, but don't block
      retryTimer = setTimeout(() => {
        if (!user) {
          logger.warn('User still null after retry, but continuing anyway');
          // Don't set error, just continue - the user might load later
        }
      }, 1000); // Reduced timeout
      // Don't return early, continue with initialization
    }

    // Safety timeout to ensure hasCheckedStatus is always set (reduced to 5 seconds)
    const safetyTimeout = setTimeout(() => {
      if (!hasCheckedStatus) {
        logger.warn('Initialization timeout reached, setting hasCheckedStatus to true');
        setHasCheckedStatus(true);
        setIsInitialized(true);
        // Don't set error immediately, let it try to continue
      }
    }, 5000); // Reduced from 10 to 5 seconds

    // Connect WebSocket first, then check status
    const initializeConnection = async (): Promise<void> => {
      try {
        // Connect WebSocket
        await webSocketService.connect(accessToken);
        logger.debug('WebSocket connected successfully');

        // Wait a bit for WebSocket to be fully ready
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Check for active session or matching status
        await checkStatus();
      } catch (err) {
        logger.error('Error connecting WebSocket', { error: err });
        setInitializationError('Error al conectar con el servidor. Por favor, recarga la página.');
        setHasCheckedStatus(true);
        clearTimeout(safetyTimeout);
      }
    };

    // Check for active session or matching status
    const checkStatus = async (): Promise<void> => {
      try {
        logger.debug('Checking matching status');
        const status = await matchingService.getStatus();
        logger.debug('Matching status', { status });

        if (status.status === 'matched' && status.sessionId) {
          // User has an active session, load it
          const activeSessionId = status.sessionId; // Store in const to avoid undefined
          setIsLoadingSession(true);
          try {
            const details = await sessionService.getSessionDetails(activeSessionId);
            setSession(details.sessionId, details.partner);
            setIsLoadingSession(false);
            setHasCheckedStatus(true);
            setIsInitialized(true);
            clearTimeout(safetyTimeout);
            logger.debug('Session loaded successfully', { sessionId: activeSessionId });

            // Join the session room in WebSocket
            // Wait a bit to ensure WebSocket is fully connected
            setTimeout(() => {
              try {
                if (webSocketService.isConnected()) {
                  webSocketService.joinRoom(activeSessionId);
                  logger.debug('Joined session room in WebSocket', { sessionId: activeSessionId });
                } else {
                  logger.warn('WebSocket not connected, cannot join room', {
                    sessionId: activeSessionId,
                  });
                }
              } catch (wsErr) {
                logger.warn('Error joining session room', {
                  error: wsErr,
                  sessionId: activeSessionId,
                });
                // Continue even if joining room fails
              }
            }, 1000);
          } catch (err) {
            logger.error('Error loading session details', {
              error: err,
              sessionId: activeSessionId,
            });
            setIsLoadingSession(false);
            clearSession();
            setHasCheckedStatus(true);
            setIsInitialized(true);
            clearTimeout(safetyTimeout);
            // Don't set error, just continue to matching
            if (autoSearch) {
              await startMatching();
            }
          }
          return;
        }
        if (status.status === 'searching') {
          // User is already searching
          logger.debug('User is already searching');
          setIsSearching(true);
          setHasCheckedStatus(true);
          setIsInitialized(true);
          clearTimeout(safetyTimeout);
        } else {
          // No active session and not searching
          logger.debug('No active session');
          setHasCheckedStatus(true);
          setIsInitialized(true);
          clearTimeout(safetyTimeout);
          // Start matching automatically if autoSearch is enabled
          if (autoSearch) {
            await startMatching();
          }
        }
      } catch (err) {
        // Ensure hasCheckedStatus is set even on error
        logger.error('Error checking matching status', { error: err });
        setHasCheckedStatus(true);
        setIsInitialized(true);
        clearTimeout(safetyTimeout);
        // Try to start matching anyway
        try {
          logger.info('Attempting to start matching after error');
          if (autoSearch) {
            await startMatching();
          }
        } catch (matchingErr) {
          logger.error('Error starting matching', { error: matchingErr });
          // Don't set initializationError, just set error for user to retry
          setError('Error al iniciar la búsqueda. Por favor, intenta nuevamente.');
        }
      }
    };

    // Start initialization
    initializeConnection();

    // Listen for match found
    const handleMatchFound = (...args: unknown[]): void => {
      const data = args[0] as {
        sessionId: string;
        partner: { username: string; name: string; avatar: string | null };
      };
      setIsSearching(false);
      // Smooth transition: fade out overlay first
      setIsTransitioning(true);
      setTimeout(() => {
        setSession(data.sessionId, data.partner);
        setIsTransitioning(false);
      }, 300); // 300ms transition
    };

    const handleMatchTimeout = (...args: unknown[]): void => {
      const data = args[0] as
        | {
            reason: string;
            message: string;
          }
        | undefined;

      setIsSearching(false);
      setError(data?.message ?? 'No se encontró ningún usuario disponible. Intenta nuevamente.');
    };

    // Listen for session ended
    const handleSessionEnded = (...args: unknown[]): void => {
      const data = args[0] as { sessionId: string };
      if (data.sessionId === sessionId) {
        clearSession();
        setIsSearching(false);
        // Restart matching automatically when session ends (if autoSearch enabled)
        if (autoSearch) {
          startMatching();
        }
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
  }, [
    isAuthenticated,
    accessToken,
    navigate,
    setSession,
    clearSession,
    sessionId,
    startMatching,
    isInitializing,
    autoSearch,
    hasCheckedStatus,
    user,
  ]);

  // Debug logging
  logger.debug('Render state', {
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
          <p className="text-gray-600 dark:text-gray-400 mb-8">{initializationError}</p>
          <div className="flex gap-4 justify-center">
            <Button variant="primary" size="lg" onClick={() => window.location.reload()}>
              Recargar Página
            </Button>
            <Button variant="secondary" size="lg" onClick={logout}>
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If there's an active session, show ChatWindow with smooth transition
  if (sessionId && partner) {
    return (
      <div
        className={`min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors ${isTransitioning ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
      >
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

  // Show video preview with searching overlay when no active session
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Local Video - Full Screen */}
      <div className="absolute inset-0 w-full h-full">
        <video
          ref={webrtcLocalVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!localStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white/80">Iniciando cámara...</p>
            </div>
          </div>
        )}
      </div>

      {/* Searching Overlay with smooth transition */}
      <div
        className={`transition-opacity duration-300 ${isSearching && !isTransitioning ? 'opacity-100' : 'opacity-0'}`}
      >
        <SearchingOverlay
          isSearching={isSearching && !isTransitioning}
          onCancel={handleCancelSearch}
          showCancelButton={isSearching && !isTransitioning}
        />
      </div>

      {/* Minimalist Header - Top Right Corner */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Auto Search Toggle */}
        <button
          onClick={() => setAutoSearch(!autoSearch)}
          className="px-3 py-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-white/20 rounded-lg shadow-lg text-white text-sm transition-colors"
          title={autoSearch ? 'Desactivar búsqueda automática' : 'Activar búsqueda automática'}
        >
          {autoSearch ? '✓ Auto' : 'Auto'}
        </button>
        {/* App Header - User menu */}
        <div className="relative">
          <AppHeader
            className="bg-black/50 backdrop-blur-sm border-white/20 rounded-lg shadow-lg border-0 shadow-none"
            showLogo={false}
          />
        </div>
      </div>

      {/* Video Controls - Bottom Center */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-3">
        <Button
          variant="secondary"
          size="md"
          onClick={toggleVideo}
          className={`bg-black/50 hover:bg-black/70 text-white border-white/20 backdrop-blur-sm ${
            !isVideoEnabled ? 'bg-red-500/50 border-red-500/50' : ''
          }`}
          title={isVideoEnabled ? 'Desactivar video' : 'Activar video'}
        >
          {isVideoEnabled ? '📹' : '📹🚫'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={toggleAudio}
          className={`bg-black/50 hover:bg-black/70 text-white border-white/20 backdrop-blur-sm ${
            !isAudioEnabled ? 'bg-red-500/50 border-red-500/50' : ''
          }`}
          title={isAudioEnabled ? 'Desactivar audio' : 'Activar audio'}
        >
          {isAudioEnabled ? '🎤' : '🎤🚫'}
        </Button>
        {!isSearching && (
          <Button
            variant="primary"
            size="lg"
            onClick={startMatching}
            disabled={isSearching}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold text-lg px-6 py-3 shadow-lg transform hover:scale-105 active:scale-95 transition-transform"
          >
            ▶️ Conectar
          </Button>
        )}
      </div>

      {/* Error Message - Top Center */}
      {(error || initializationError) && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-30 max-w-md">
          <div className="bg-red-500/90 backdrop-blur-sm border border-red-400 text-white p-4 rounded-lg shadow-xl">
            <p className="text-center mb-3">{error || initializationError}</p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setError(null);
                  setInitializationError(null);
                  if (!isSearching) {
                    startMatching();
                  }
                }}
                className="bg-white/20 hover:bg-white/30 text-white"
              >
                Intentar de nuevo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
