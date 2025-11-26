import { useState, useEffect, useCallback } from 'react';
import { adminService, type ReportHistoryItem } from '@infrastructure/api/admin-service';
import { Button } from '../Button';
import { Avatar } from '../Avatar';
import { ClipboardIcon, FunnelIcon, UserIcon, ClockIcon } from '../Icons';

export function ReportsHistory(): JSX.Element {
  const [reports, setReports] = useState<ReportHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  const loadReports = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await adminService.getReportsHistory({
        limit,
        offset: currentPage * limit,
        status:
          filterStatus === 'all'
            ? undefined
            : (filterStatus as 'PENDING' | 'RESOLVED' | 'DISMISSED'),
        category:
          filterCategory === 'all'
            ? undefined
            : (filterCategory as 'SPAM' | 'INAPPROPRIATE_CONTENT' | 'HARASSMENT' | 'OTHER'),
      });
      setReports(response.reports);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Error al cargar historial de reportes';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, filterStatus, filterCategory]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const categoryLabels: Record<string, string> = {
    SPAM: 'Spam',
    INAPPROPRIATE_CONTENT: 'Contenido Inapropiado',
    HARASSMENT: 'Acoso',
    OTHER: 'Otro',
  };

  const statusLabels: Record<string, string> = {
    PENDING: 'Pendiente',
    RESOLVED: 'Resuelto',
    DISMISSED: 'Desestimado',
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    DISMISSED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Historial de Reportes</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <FunnelIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Filtros:</span>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(0);
            }}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="RESOLVED">Resuelto</option>
            <option value="DISMISSED">Desestimado</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value);
              setCurrentPage(0);
            }}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todas las categorías</option>
            <option value="SPAM">Spam</option>
            <option value="INAPPROPRIATE_CONTENT">Contenido Inapropiado</option>
            <option value="HARASSMENT">Acoso</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        {total > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {reports.length} de {total} reportes
          </p>
        )}
      </div>

      {/* Reports List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Cargando reportes...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4">
              {error}
            </div>
            <Button onClick={loadReports}>Reintentar</Button>
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-gray-600 dark:text-gray-400">
            No se encontraron reportes.
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all border-l-4 border-transparent hover:border-primary-500"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full text-xs font-semibold shadow-sm">
                          {categoryLabels[report.category] || report.category}
                        </span>
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${statusColors[report.status] || statusColors.PENDING}`}
                        >
                          {statusLabels[report.status] || report.status}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          {new Date(report.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {report.description && (
                        <p className="text-gray-700 dark:text-gray-300 mb-4 line-clamp-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm">
                          {report.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-6 text-sm mb-3">
                        {report.reporter && (
                          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg">
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-500 dark:text-gray-400">Reportado por:</span>
                            <div className="flex items-center gap-2">
                              <Avatar
                                name={report.reporter.name}
                                avatar={report.reporter.avatar}
                                size="xs"
                              />
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {report.reporter.name}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400">
                                @{report.reporter.username}
                              </span>
                            </div>
                          </div>
                        )}
                        {report.reportedUser && (
                          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg">
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-500 dark:text-gray-400">
                              Usuario reportado:
                            </span>
                            <div className="flex items-center gap-2">
                              <Avatar
                                name={report.reportedUser.name}
                                avatar={report.reportedUser.avatar}
                                size="xs"
                              />
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {report.reportedUser.name}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400">
                                @{report.reportedUser.username}
                              </span>
                              {report.reportedUser.isBanned && (
                                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-full text-xs font-semibold">
                                  Baneado
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {report.reviewedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" />
                          Revisado el: {new Date(report.reviewedAt).toLocaleString()}
                        </p>
                      )}
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
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Página {currentPage + 1}
                </span>
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
