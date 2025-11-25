import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@application/stores/auth-store';
import { adminService, type AdminStats } from '@infrastructure/api/admin-service';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { UserManagement } from '../components/admin/UserManagement';
import { ReportsHistory } from '../components/admin/ReportsHistory';
import { ActiveSessions } from '../components/admin/ActiveSessions';
import { StatsCharts } from '../components/admin/StatsCharts';
import { AuditLogs } from '../components/admin/AuditLogs';
import { PendingReport } from '@infrastructure/api/admin-service';
import { logger } from '@infrastructure/logging/frontend-logger';
import {
  DashboardIcon,
  WarningIcon,
  ClipboardIcon,
  UsersIcon,
  ChatIcon,
  DocumentIcon,
  XMarkIcon,
  UserIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '../components/Icons';

type TabType = 'dashboard' | 'pending-reports' | 'reports-history' | 'users' | 'sessions' | 'audit-logs';

export function AdminDashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { user, accessToken, isAuthenticated, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<PendingReport | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

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

    if (activeTab === 'dashboard' || activeTab === 'pending-reports') {
      loadData();
    }
  }, [isAuthenticated, accessToken, user, navigate, activeTab]);

  const loadData = async (): Promise<void> => {
    if (activeTab === 'pending-reports') {
      await loadReports();
    }
    if (activeTab === 'dashboard') {
      await Promise.all([loadReports(), loadStats()]);
    }
  };

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

  const loadStats = async (): Promise<void> => {
    try {
      setIsLoadingStats(true);
      const statsData = await adminService.getStats();
      setStats(statsData);
    } catch (err) {
      logger.error('Error loading stats', { error: err });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleReviewReport = async (
    reportId: string,
    status: 'RESOLVED' | 'DISMISSED'
  ): Promise<void> => {
    try {
      setIsReviewing(true);
      await adminService.reviewReport(reportId, { status });
      // Reload reports and stats after review
      await Promise.all([loadReports(), loadStats()]);
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

  // Filter reports based on search and category
  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      searchTerm === '' ||
      report.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reporter?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reporter?.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reportedUser?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reportedUser?.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      filterCategory === 'all' || report.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  const categoryLabels: Record<string, string> = {
    spam: 'Spam',
    inappropriate_content: 'Contenido Inapropiado',
    harassment: 'Acoso',
    other: 'Otro',
  };

  const tabs: Array<{ id: TabType; label: string; icon: JSX.Element }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon className="w-5 h-5" /> },
    { id: 'pending-reports', label: 'Reportes Pendientes', icon: <WarningIcon className="w-5 h-5" /> },
    { id: 'reports-history', label: 'Historial de Reportes', icon: <ClipboardIcon className="w-5 h-5" /> },
    { id: 'users', label: 'Gestión de Usuarios', icon: <UsersIcon className="w-5 h-5" /> },
    { id: 'sessions', label: 'Sesiones Activas', icon: <ChatIcon className="w-5 h-5" /> },
    { id: 'audit-logs', label: 'Logs de Auditoría', icon: <DocumentIcon className="w-5 h-5" /> },
  ];

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-gray-900 dark:text-white transition-colors">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800 rounded-xl shadow-xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Panel de Administración</h1>
              <p className="text-primary-100 text-sm">Bienvenido, {user.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button variant="secondary" size="sm" onClick={() => navigate('/videochat')} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
                Volver
              </Button>
              <Button variant="secondary" size="sm" onClick={logout} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg mb-6 transition-colors overflow-x-auto border border-gray-200 dark:border-gray-700">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-primary-600 dark:text-primary-400' : ''}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[600px]">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              {isLoadingStats ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-lg transition-colors">
                  <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-1/4"></div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : stats ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-xl transition-colors border border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Estadísticas Generales</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 border border-blue-400 dark:border-blue-600">
                      <div className="flex items-center justify-between mb-4">
                        <UsersIcon className="w-8 h-8 text-white/80" />
                      </div>
                      <p className="text-sm text-blue-100 mb-2 font-medium">Usuarios Totales</p>
                      <p className="text-4xl font-bold text-white mb-3">{stats.users.total}</p>
                      <div className="flex gap-3 text-xs text-blue-100">
                        <span className="bg-white/20 px-2 py-1 rounded">{stats.users.active} activos</span>
                        <span className="bg-red-500/30 px-2 py-1 rounded">{stats.users.banned} baneados</span>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 border border-purple-400 dark:border-purple-600">
                      <div className="flex items-center justify-between mb-4">
                        <ChatIcon className="w-8 h-8 text-white/80" />
                      </div>
                      <p className="text-sm text-purple-100 mb-2 font-medium">Sesiones</p>
                      <p className="text-4xl font-bold text-white mb-3">{stats.sessions.total}</p>
                      <div className="flex gap-3 text-xs text-purple-100">
                        <span className="bg-white/20 px-2 py-1 rounded">{stats.sessions.active} activas</span>
                        <span className="bg-white/20 px-2 py-1 rounded">{stats.sessions.ended} finalizadas</span>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-yellow-500 to-orange-500 dark:from-yellow-600 dark:to-orange-600 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 border border-yellow-400 dark:border-yellow-600">
                      <div className="flex items-center justify-between mb-4">
                        <WarningIcon className="w-8 h-8 text-white/80" />
                      </div>
                      <p className="text-sm text-yellow-100 mb-2 font-medium">Reportes</p>
                      <p className="text-4xl font-bold text-white mb-3">{stats.reports.total}</p>
                      <div className="flex gap-3 text-xs text-yellow-100">
                        <span className="bg-white/20 px-2 py-1 rounded">{stats.reports.pending} pendientes</span>
                        <span className="bg-green-500/30 px-2 py-1 rounded">{stats.reports.resolved} resueltos</span>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-green-500 to-emerald-500 dark:from-green-600 dark:to-emerald-600 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 border border-green-400 dark:border-green-600">
                      <div className="flex items-center justify-between mb-4">
                        <DocumentIcon className="w-8 h-8 text-white/80" />
                      </div>
                      <p className="text-sm text-green-100 mb-2 font-medium">Mensajes</p>
                      <p className="text-4xl font-bold text-white mb-3">{stats.messages.total}</p>
                      <div className="flex gap-3 text-xs text-green-100">
                        <span className="bg-white/20 px-2 py-1 rounded">{stats.messages.today} hoy</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Advanced Stats Charts */}
              <StatsCharts />
            </div>
          )}

          {activeTab === 'pending-reports' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Reportes Pendientes</h2>
                  
                  {/* Search and Filter */}
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar reportes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-64"
                      />
                    </div>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="all">Todas las categorías</option>
                      <option value="spam">Spam</option>
                      <option value="inappropriate_content">Contenido Inapropiado</option>
                      <option value="harassment">Acoso</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                </div>
                {filteredReports.length !== reports.length && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                    Mostrando {filteredReports.length} de {reports.length} reportes
                  </p>
                )}
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
              ) : filteredReports.length === 0 ? (
            <div className="p-8 text-center text-gray-600 dark:text-gray-400">
                  {searchTerm || filterCategory !== 'all'
                    ? 'No se encontraron reportes con los filtros aplicados.'
                    : 'No hay reportes pendientes.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all cursor-pointer border-l-4 border-transparent hover:border-primary-500"
                  onClick={() => setSelectedReport(report)}
                >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full text-xs font-semibold">
                              {categoryLabels[report.category] || report.category}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          {new Date(report.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {report.description && (
                            <p className="text-gray-700 dark:text-gray-300 mb-4 line-clamp-2 text-sm">
                          {report.description}
                        </p>
                      )}
                          <div className="flex flex-wrap gap-6 text-sm">
                            {report.reporter && (
                              <div className="flex items-center gap-2">
                                <UserIcon className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-500 dark:text-gray-400">Reportado por:</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 dark:text-white">{report.reporter.name}</span>
                                  <span className="text-gray-500 dark:text-gray-400">@{report.reporter.username}</span>
                                </div>
                              </div>
                            )}
                            {report.reportedUser && (
                              <div className="flex items-center gap-2">
                                <UserIcon className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-500 dark:text-gray-400">Usuario reportado:</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 dark:text-white">{report.reportedUser.name}</span>
                                  <span className="text-gray-500 dark:text-gray-400">@{report.reportedUser.username}</span>
                                  {report.reportedUser.isBanned && (
                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-full text-xs font-semibold">
                                      Baneado
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReport(report);
                      }}
                      className="shrink-0"
                    >
                      Revisar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
            </div>
          )}

          {activeTab === 'reports-history' && <ReportsHistory />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'sessions' && <ActiveSessions />}
          {activeTab === 'audit-logs' && <AuditLogs />}
        </div>
      </div>

      {/* Report Details Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700 animate-scale-in">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700 z-10">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Detalles del Reporte</h3>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                  Categoría
                </label>
                <span className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full text-sm font-semibold inline-block">
                  {categoryLabels[selectedReport.category] || selectedReport.category}
                </span>
              </div>
              {selectedReport.description && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                    Descripción
                  </label>
                  <p className="mt-2 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                    {selectedReport.description}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedReport.reporter && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                      Reportado por
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <UserIcon className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{selectedReport.reporter.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">@{selectedReport.reporter.username}</p>
                      </div>
                    </div>
                  </div>
                )}
                {selectedReport.reportedUser && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                      Usuario reportado
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <UserIcon className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{selectedReport.reportedUser.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">@{selectedReport.reportedUser.username}</p>
                        {selectedReport.reportedUser.isBanned && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-full text-xs font-semibold">
                            Usuario baneado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                    Sesión ID
                  </label>
                  <p className="mt-2 font-mono text-sm text-gray-900 dark:text-white break-all">{selectedReport.sessionId}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                    Fecha
                  </label>
                  <p className="mt-2 text-gray-900 dark:text-white flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-gray-400" />
                    {new Date(selectedReport.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="primary"
                  onClick={() =>
                    handleReviewReport(selectedReport.id, 'RESOLVED')
                  }
                  isLoading={isReviewing}
                  disabled={isReviewing}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <CheckCircleIcon className="w-5 h-5" />
                  Resolver
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    handleReviewReport(selectedReport.id, 'DISMISSED')
                  }
                  isLoading={isReviewing}
                  disabled={isReviewing}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <XCircleIcon className="w-5 h-5" />
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
