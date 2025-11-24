import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@application/stores/auth-store';
import { adminService, type PendingReport } from '@infrastructure/api/admin-service';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

export function AdminDashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { user, accessToken, isAuthenticated, logout } = useAuthStore();
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<PendingReport | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      navigate('/login');
      return;
    }

    // Check if user is admin
    if (user?.role !== 'ADMIN') {
      navigate('/videochat');
      return;
    }

    loadReports();
  }, [isAuthenticated, accessToken, user, navigate]);

  const loadReports = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await adminService.getPendingReports(50);
      setReports(response.reports);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Error al cargar reportes. Intenta nuevamente.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewReport = async (
    reportId: string,
    status: 'RESOLVED' | 'DISMISSED'
  ): Promise<void> => {
    try {
      setIsReviewing(true);
      await adminService.reviewReport(reportId, { status });
      // Reload reports after review
      await loadReports();
      setSelectedReport(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Error al revisar reporte. Intenta nuevamente.';
      alert(errorMessage);
    } finally {
      setIsReviewing(false);
    }
  };

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Acceso denegado. Solo administradores pueden acceder a esta página.</p>
          <Button onClick={() => navigate('/videochat')} className="mt-4">
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">Panel de Administración</h1>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="text-gray-600 dark:text-gray-300">Hola, {user.name}</span>
            <Button variant="secondary" size="sm" onClick={() => navigate('/videochat')}>
              Volver
            </Button>
            <Button variant="secondary" size="sm" onClick={logout}>
              Cerrar Sesión
            </Button>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-lg transition-colors">
          <h2 className="text-xl font-bold mb-4">Estadísticas</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Reportes Pendientes</p>
              <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                {reports.length}
              </p>
            </div>
          </div>
        </div>

        {/* Reports List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg transition-colors">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold">Reportes Pendientes</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Cargando reportes...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4">
                {error}
              </div>
              <Button onClick={loadReports}>Reintentar</Button>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center text-gray-600 dark:text-gray-400">
              No hay reportes pendientes.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedReport(report)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold">
                          {report.category}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(report.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {report.description && (
                        <p className="text-gray-700 dark:text-gray-300 mb-2">
                          {report.description}
                        </p>
                      )}
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        <p>Sesión: {report.sessionId}</p>
                        <p>Reportado por: {report.reporterId}</p>
                        <p>Usuario reportado: {report.reportedUserId}</p>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReport(report);
                      }}
                    >
                      Revisar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Details Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Detalles del Reporte</h3>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Categoría
                </label>
                <p className="mt-1">{selectedReport.category}</p>
              </div>
              {selectedReport.description && (
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Descripción
                  </label>
                  <p className="mt-1 text-gray-700 dark:text-gray-300">
                    {selectedReport.description}
                  </p>
                </div>
              )}
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Sesión ID
                </label>
                <p className="mt-1 font-mono text-sm">{selectedReport.sessionId}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Reportado por
                </label>
                <p className="mt-1 font-mono text-sm">{selectedReport.reporterId}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Usuario reportado
                </label>
                <p className="mt-1 font-mono text-sm">{selectedReport.reportedUserId}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Fecha
                </label>
                <p className="mt-1">
                  {new Date(selectedReport.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="primary"
                  onClick={() =>
                    handleReviewReport(selectedReport.id, 'RESOLVED')
                  }
                  isLoading={isReviewing}
                  disabled={isReviewing}
                  className="flex-1"
                >
                  Resolver
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    handleReviewReport(selectedReport.id, 'DISMISSED')
                  }
                  isLoading={isReviewing}
                  disabled={isReviewing}
                  className="flex-1"
                >
                  Desestimar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

