import { useState, useEffect } from 'react';
import { adminService, type ActiveSession } from '@infrastructure/api/admin-service';
import { Button } from '../Button';
import { Avatar } from '../Avatar';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../ConfirmDialog';
import { AlertDialog } from '../AlertDialog';
import { ChatIcon, ClockIcon, ArrowPathIcon, UserIcon } from '../Icons';

export function ActiveSessions(): JSX.Element {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; sessionId: string | null }>({
    isOpen: false,
    sessionId: null,
  });
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });
  const limit = 20;

  useEffect(() => {
    loadSessions();
    // Refresh every 10 seconds
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [currentPage]);

  const loadSessions = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await adminService.getActiveSessions({
        limit,
        offset: currentPage * limit,
      });
      setSessions(response.sessions);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar sesiones activas';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSessionClick = (sessionId: string): void => {
    setConfirmDialog({ isOpen: true, sessionId });
  };

  const handleConfirmEndSession = async (): Promise<void> => {
    if (!confirmDialog.sessionId) return;

    try {
      setEndingSessionId(confirmDialog.sessionId);
      setConfirmDialog({ isOpen: false, sessionId: null });
      await adminService.endSession(confirmDialog.sessionId, 'Terminada por administrador');
      await loadSessions();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al terminar sesión';
      setAlertDialog({ isOpen: true, message: errorMessage });
    } finally {
      setEndingSessionId(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
              <ChatIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              Sesiones Activas
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Total: <span className="font-semibold text-gray-700 dark:text-gray-300">{total}</span> sesión{total !== 1 ? 'es' : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadSessions} className="flex items-center gap-2">
            <ArrowPathIcon className="w-4 h-4" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Cargando sesiones...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4">
              {error}
            </div>
            <Button onClick={loadSessions}>Reintentar</Button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-gray-600 dark:text-gray-400">
            No hay sesiones activas en este momento.
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all border-l-4 border-transparent hover:border-primary-500"
                >
                  <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* User 1 */}
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div
                          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => navigate(`/profile/${session.user1.username}`)}
                        >
                          <Avatar name={session.user1.name} avatar={session.user1.avatar} size="lg" />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <p className="font-semibold text-gray-900 dark:text-white">{session.user1.name}</p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">@{session.user1.username}</p>
                          </div>
                        </div>
                      </div>

                      {/* User 2 */}
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                        <div
                          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => navigate(`/profile/${session.user2.username}`)}
                        >
                          <Avatar name={session.user2.name} avatar={session.user2.avatar} size="lg" />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <UserIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              <p className="font-semibold text-gray-900 dark:text-white">{session.user2.name}</p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">@{session.user2.username}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
                      <div className="text-right">
                        <div className="flex items-center gap-2 mb-2">
                          <ClockIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Duración</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                          {formatDuration(session.duration)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" />
                          Iniciada: {new Date(session.startedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleEndSessionClick(session.id)}
                        isLoading={endingSessionId === session.id}
                        className="w-full"
                      >
                        Terminar Sesión
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {(hasMore || currentPage > 0) && (
              <div className="px-6 py-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-between items-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  Anterior
                </Button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Página {currentPage + 1}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!hasMore}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, sessionId: null })}
        onConfirm={handleConfirmEndSession}
        title="Terminar Sesión"
        message="¿Estás seguro de que quieres terminar esta sesión?"
        confirmText="Terminar"
        cancelText="Cancelar"
        variant="danger"
        isLoading={endingSessionId !== null}
      />

      {/* Alert Dialog */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ isOpen: false, message: '' })}
        title="Error"
        message={alertDialog.message}
        variant="error"
      />
    </div>
  );
}

