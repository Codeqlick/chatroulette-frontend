import { useState, useEffect } from 'react';
import { adminService, type AuditLog } from '@infrastructure/api/admin-service';
import { Button } from '../Button';
import { DocumentIcon, FunnelIcon, ClockIcon, UserIcon } from '../Icons';

export function AuditLogs(): JSX.Element {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterEventType, setFilterEventType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 50;

  useEffect(() => {
    loadLogs();
  }, [currentPage, filterEventType]);

  const loadLogs = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await adminService.getAuditLogs({
        limit,
        offset: currentPage * limit,
        eventType: filterEventType === 'all' ? undefined : filterEventType,
      });
      setLogs(response.logs);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar logs de auditoría';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const eventTypeLabels: Record<string, string> = {
    ADMIN_ACTION: 'Acción de Admin',
    USER_BANNED: 'Usuario Baneado',
    USER_UNBANNED: 'Usuario Desbaneado',
    LOGIN_SUCCESS: 'Login Exitoso',
    LOGIN_FAILED: 'Login Fallido',
    REGISTER_SUCCESS: 'Registro Exitoso',
    REGISTER_FAILED: 'Registro Fallido',
    PERMISSION_CHANGED: 'Permiso Cambiado',
    SENSITIVE_DATA_ACCESS: 'Acceso a Datos Sensibles',
    RATE_LIMIT_EXCEEDED: 'Límite de Tasa Excedido',
    UNAUTHORIZED_ACCESS_ATTEMPT: 'Intento de Acceso No Autorizado',
  };

  const eventTypeColors: Record<string, string> = {
    ADMIN_ACTION: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    USER_BANNED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    USER_UNBANNED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    LOGIN_SUCCESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    LOGIN_FAILED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    REGISTER_SUCCESS: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    REGISTER_FAILED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    PERMISSION_CHANGED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    SENSITIVE_DATA_ACCESS: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
    RATE_LIMIT_EXCEEDED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    UNAUTHORIZED_ACCESS_ATTEMPT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <DocumentIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Logs de Auditoría</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <FunnelIcon className="w-5 h-5" />
            <label className="text-sm font-semibold">Tipo de evento:</label>
          </div>
          <select
            value={filterEventType}
            onChange={(e) => {
              setFilterEventType(e.target.value);
              setCurrentPage(0);
            }}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los eventos</option>
            <option value="ADMIN_ACTION">Acción de Admin</option>
            <option value="USER_BANNED">Usuario Baneado</option>
            <option value="USER_UNBANNED">Usuario Desbaneado</option>
            <option value="LOGIN_SUCCESS">Login Exitoso</option>
            <option value="LOGIN_FAILED">Login Fallido</option>
            <option value="REGISTER_SUCCESS">Registro Exitoso</option>
            <option value="REGISTER_FAILED">Registro Fallido</option>
            <option value="PERMISSION_CHANGED">Permiso Cambiado</option>
            <option value="SENSITIVE_DATA_ACCESS">Acceso a Datos Sensibles</option>
            <option value="RATE_LIMIT_EXCEEDED">Límite de Tasa Excedido</option>
            <option value="UNAUTHORIZED_ACCESS_ATTEMPT">Intento de Acceso No Autorizado</option>
          </select>
        </div>
        {total > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {logs.length} de {total} logs
          </p>
        )}
      </div>

      {/* Logs List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Cargando logs...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4">
              {error}
            </div>
            <Button onClick={loadLogs}>Reintentar</Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-600 dark:text-gray-400">
            {total === 0 ? (
              <p>No hay logs de auditoría disponibles. Los logs se almacenan en el sistema de logging.</p>
            ) : (
              'No se encontraron logs con los filtros aplicados.'
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.map((log) => (
                <div key={log.id} className="p-5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all border-l-4 border-transparent hover:border-primary-500">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${
                            eventTypeColors[log.eventType] || eventTypeColors.ADMIN_ACTION
                          }`}
                        >
                          {eventTypeLabels[log.eventType] || log.eventType}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                        {log.userId && (
                          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg">
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            <span className="font-semibold text-gray-600 dark:text-gray-400">Usuario:</span>
                            <span className="font-mono text-xs">{log.userId}</span>
                          </div>
                        )}
                        {log.adminId && (
                          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg">
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            <span className="font-semibold text-gray-600 dark:text-gray-400">Admin:</span>
                            <span className="font-mono text-xs">{log.adminId}</span>
                          </div>
                        )}
                        {log.targetId && (
                          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg">
                            <span className="font-semibold text-gray-600 dark:text-gray-400">Objetivo:</span>
                            <span className="font-mono text-xs">{log.targetId}</span>
                          </div>
                        )}
                        {log.details && Object.keys(log.details).length > 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-primary-600 dark:text-primary-400 font-semibold hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
                              Ver detalles
                            </summary>
                            <pre className="mt-3 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs overflow-x-auto border border-gray-200 dark:border-gray-600">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
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
    </div>
  );
}

