import { useState, useEffect } from 'react';
import { adminService, type UserDetails } from '@infrastructure/api/admin-service';
import { Button } from '../Button';
import { Avatar } from '../Avatar';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../ConfirmDialog';
import { AlertDialog } from '../AlertDialog';

interface UserDetailsModalProps {
  userId: string;
  onClose: () => void;
  onUserUpdated?: () => void;
}

type TabType = 'info' | 'stats' | 'bans' | 'payments' | 'sessions';

export function UserDetailsModal({ userId, onClose, onUserUpdated }: UserDetailsModalProps): JSX.Element {
  const navigate = useNavigate();
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [isBanning, setIsBanning] = useState(false);
  const [isUnbanning, setIsUnbanning] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banUntil, setBanUntil] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; type: 'ban' | 'unban' | null }>({
    isOpen: false,
    type: null,
  });
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; message: string; variant?: 'error' | 'warning' | 'info' | 'success' }>({
    isOpen: false,
    message: '',
    variant: 'error',
  });

  useEffect(() => {
    loadUserDetails();
  }, [userId]);

  const loadUserDetails = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const details = await adminService.getUserDetails(userId);
      setUserDetails(details);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar detalles del usuario';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBanClick = (): void => {
    if (!banReason.trim()) {
      setAlertDialog({ isOpen: true, message: 'Por favor, proporciona una razón para el ban', variant: 'warning' });
      return;
    }
    setConfirmDialog({ isOpen: true, type: 'ban' });
  };

  const handleConfirmBan = async (): Promise<void> => {
    setConfirmDialog({ isOpen: false, type: null });
    try {
      setIsBanning(true);
      await adminService.banUser(userId, {
        reason: banReason,
        bannedUntil: banUntil || undefined,
      });
      await loadUserDetails();
      onUserUpdated?.();
      setBanReason('');
      setBanUntil('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al banear usuario';
      setAlertDialog({ isOpen: true, message: errorMessage, variant: 'error' });
    } finally {
      setIsBanning(false);
    }
  };

  const handleUnbanClick = (): void => {
    setConfirmDialog({ isOpen: true, type: 'unban' });
  };

  const handleConfirmUnban = async (): Promise<void> => {
    setConfirmDialog({ isOpen: false, type: null });
    try {
      setIsUnbanning(true);
      await adminService.unbanUser(userId);
      await loadUserDetails();
      onUserUpdated?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al desbanear usuario';
      setAlertDialog({ isOpen: true, message: errorMessage, variant: 'error' });
    } finally {
      setIsUnbanning(false);
    }
  };


  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-center text-gray-600 dark:text-gray-400">Cargando detalles del usuario...</p>
        </div>
      </div>
    );
  }

  if (error || !userDetails) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4">
            {error || 'Error al cargar detalles del usuario'}
          </div>
          <div className="flex gap-4">
            <Button onClick={loadUserDetails}>Reintentar</Button>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'info', label: 'Información' },
    { id: 'stats', label: 'Estadísticas' },
    { id: 'bans', label: 'Historial de Baneos' },
    { id: 'payments', label: 'Pagos' },
    { id: 'sessions', label: 'Sesiones Recientes' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-4">
            <Avatar name={userDetails.user.name} avatar={userDetails.user.avatar} size="lg" />
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{userDetails.user.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">@{userDetails.user.username}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Email</label>
                <p className="mt-1 text-gray-900 dark:text-white">{userDetails.user.email}</p>
              </div>
              {userDetails.user.bio && (
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Biografía</label>
                  <p className="mt-1 text-gray-900 dark:text-white">{userDetails.user.bio}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Rol</label>
                <p className="mt-1">
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded text-sm font-semibold">
                    {userDetails.user.role}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Estado</label>
                <div className="mt-1 flex gap-2">
                  {userDetails.user.isBanned && (
                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded text-sm font-semibold">
                      Baneado
                    </span>
                  )}
                  {userDetails.user.emailVerified && (
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded text-sm font-semibold">
                      Verificado
                    </span>
                  )}
                </div>
              </div>
              {userDetails.user.isBanned && userDetails.user.banReason && (
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Razón del ban</label>
                  <p className="mt-1 text-gray-900 dark:text-white">{userDetails.user.banReason}</p>
                  {userDetails.user.bannedAt && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Baneado el: {new Date(userDetails.user.bannedAt).toLocaleString()}
                    </p>
                  )}
                  {userDetails.user.bannedUntil && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Hasta: {new Date(userDetails.user.bannedUntil).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Fecha de registro</label>
                <p className="mt-1 text-gray-900 dark:text-white">
                  {new Date(userDetails.user.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Sesiones Totales</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {userDetails.stats.sessionsTotal}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {userDetails.stats.sessionsActive} activas
                </p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Reportes Recibidos</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {userDetails.stats.reportsReceived}
                </p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Reportes Enviados</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {userDetails.stats.reportsSent}
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Mensajes</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {userDetails.stats.messagesCount}
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Likes Dados</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {userDetails.stats.likesGiven}
                </p>
              </div>
              <div className="bg-pink-50 dark:bg-pink-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Likes Recibidos</p>
                <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                  {userDetails.stats.likesReceived}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'bans' && (
            <div className="space-y-4">
              {userDetails.banHistory.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No hay historial de baneos.</p>
              ) : (
                userDetails.banHistory.map((ban, index) => (
                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="font-semibold text-gray-900 dark:text-white">{ban.reason}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(ban.bannedAt).toLocaleString()}
                    </p>
                    {ban.bannedUntil && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Hasta: {new Date(ban.bannedUntil).toLocaleString()}
                      </p>
                    )}
                    {ban.bannedBy && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Por: {ban.bannedBy}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-4">
              {userDetails.unbanPayments.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No hay pagos de desban.</p>
              ) : (
                userDetails.unbanPayments.map((payment) => (
                  <div key={payment.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          ${payment.amount} {payment.currency.toUpperCase()}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(payment.createdAt).toLocaleString()}
                        </p>
                        {payment.completedAt && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Completado: {new Date(payment.completedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          payment.status === 'SUCCEEDED'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : payment.status === 'PENDING'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {payment.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-4">
              {userDetails.recentSessions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No hay sesiones recientes.</p>
              ) : (
                userDetails.recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/profile/${session.partnerUsername}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{session.partnerName}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">@{session.partnerUsername}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(session.startedAt).toLocaleString()}
                        </p>
                        {session.endedAt && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Finalizada: {new Date(session.endedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          session.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                        }`}
                      >
                        {session.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center flex-shrink-0">
          <div className="flex gap-4">
            {!userDetails.user.isBanned ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Razón del ban"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <input
                  type="datetime-local"
                  placeholder="Ban hasta (opcional)"
                  value={banUntil}
                  onChange={(e) => setBanUntil(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <Button variant="danger" size="sm" onClick={handleBanClick} isLoading={isBanning}>
                  Banear
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={handleUnbanClick} isLoading={isUnbanning}>
                Desbanear
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/profile/${userDetails.user.username}`)}>
            Ver Perfil Público
          </Button>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen && confirmDialog.type === 'ban'}
        onClose={() => setConfirmDialog({ isOpen: false, type: null })}
        onConfirm={handleConfirmBan}
        title="Banear Usuario"
        message={`¿Estás seguro de que quieres banear a ${userDetails?.user.name || 'este usuario'}?`}
        confirmText="Banear"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isBanning}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen && confirmDialog.type === 'unban'}
        onClose={() => setConfirmDialog({ isOpen: false, type: null })}
        onConfirm={handleConfirmUnban}
        title="Desbanear Usuario"
        message={`¿Estás seguro de que quieres desbanear a ${userDetails?.user.name || 'este usuario'}?`}
        confirmText="Desbanear"
        cancelText="Cancelar"
        variant="info"
        isLoading={isUnbanning}
      />

      {/* Alert Dialog */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ isOpen: false, message: '', variant: 'error' })}
        title={alertDialog.variant === 'warning' ? 'Advertencia' : 'Error'}
        message={alertDialog.message}
        variant={alertDialog.variant || 'error'}
      />
    </div>
  );
}

