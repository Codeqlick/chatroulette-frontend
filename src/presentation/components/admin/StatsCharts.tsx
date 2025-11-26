import { useState, useEffect, useCallback } from 'react';
import { adminService, type AdvancedStats } from '@infrastructure/api/admin-service';
import { ChartBarIcon, UsersIcon, WarningIcon, ChatIcon, DocumentIcon, ClockIcon } from '../Icons';

export function StatsCharts(): JSX.Element {
  const [stats, setStats] = useState<AdvancedStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');

  const loadStats = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getAdvancedStats(period);
      setStats(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar estadísticas';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center border border-gray-200 dark:border-gray-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Cargando estadísticas...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center border border-gray-200 dark:border-gray-700">
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4">
          {error || 'Error al cargar estadísticas'}
        </div>
      </div>
    );
  }

  const maxTrendValue = Math.max(
    ...stats.trends.newUsers.map((t) => t.count),
    ...stats.trends.reports.map((t) => t.count),
    ...stats.trends.sessions.map((t) => t.count),
    ...stats.trends.messages.map((t) => t.count),
    1
  );

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Período:
            </label>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month')}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="day">Último día</option>
            <option value="week">Última semana</option>
            <option value="month">Último mes</option>
          </select>
          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <ClockIcon className="w-4 h-4" />
            {new Date(stats.startDate).toLocaleDateString()} -{' '}
            {new Date(stats.endDate).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Trends - Simple Bar Chart Representation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
          <ChartBarIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          Tendencias
        </h3>
        <div className="space-y-8">
          {/* New Users Trend */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-5 rounded-xl border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Usuarios Nuevos
            </h4>
            <div className="flex items-end gap-1.5 h-40 bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
              {stats.trends.newUsers.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 w-full text-center">No hay datos</p>
              ) : (
                stats.trends.newUsers.map((item, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center group">
                    <div
                      className="w-full bg-gradient-to-t from-blue-600 to-blue-500 rounded-t-lg transition-all hover:from-blue-700 hover:to-blue-600 shadow-md hover:shadow-lg cursor-pointer"
                      style={{
                        height: `${(item.count / maxTrendValue) * 100}%`,
                        minHeight: item.count > 0 ? '4px' : '0',
                      }}
                      title={`${item.date}: ${item.count}`}
                    >
                      {item.count > 0 && (
                        <div className="hidden group-hover:block absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          {item.count}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 dark:text-gray-400 mt-2 truncate w-full text-center font-medium">
                      {new Date(item.date).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Reports Trend */}
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 p-5 rounded-xl border border-yellow-200 dark:border-yellow-800">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <WarningIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              Reportes
            </h4>
            <div className="flex items-end gap-1.5 h-40 bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
              {stats.trends.reports.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 w-full text-center">No hay datos</p>
              ) : (
                stats.trends.reports.map((item, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full bg-gradient-to-t from-yellow-600 to-yellow-500 rounded-t-lg transition-all hover:from-yellow-700 hover:to-yellow-600 shadow-md hover:shadow-lg cursor-pointer"
                      style={{
                        height: `${(item.count / maxTrendValue) * 100}%`,
                        minHeight: item.count > 0 ? '4px' : '0',
                      }}
                      title={`${item.date}: ${item.count}`}
                    ></div>
                    <span className="text-xs text-gray-600 dark:text-gray-400 mt-2 truncate w-full text-center font-medium">
                      {new Date(item.date).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sessions Trend */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-5 rounded-xl border border-purple-200 dark:border-purple-800">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <ChatIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              Sesiones
            </h4>
            <div className="flex items-end gap-1.5 h-40 bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
              {stats.trends.sessions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 w-full text-center">No hay datos</p>
              ) : (
                stats.trends.sessions.map((item, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full bg-gradient-to-t from-purple-600 to-purple-500 rounded-t-lg transition-all hover:from-purple-700 hover:to-purple-600 shadow-md hover:shadow-lg cursor-pointer"
                      style={{
                        height: `${(item.count / maxTrendValue) * 100}%`,
                        minHeight: item.count > 0 ? '4px' : '0',
                      }}
                      title={`${item.date}: ${item.count}`}
                    ></div>
                    <span className="text-xs text-gray-600 dark:text-gray-400 mt-2 truncate w-full text-center font-medium">
                      {new Date(item.date).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Messages Trend */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-5 rounded-xl border border-green-200 dark:border-green-800">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <DocumentIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              Mensajes
            </h4>
            <div className="flex items-end gap-1.5 h-40 bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
              {stats.trends.messages.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 w-full text-center">No hay datos</p>
              ) : (
                stats.trends.messages.map((item, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full bg-gradient-to-t from-green-600 to-green-500 rounded-t-lg transition-all hover:from-green-700 hover:to-green-600 shadow-md hover:shadow-lg cursor-pointer"
                      style={{
                        height: `${(item.count / maxTrendValue) * 100}%`,
                        minHeight: item.count > 0 ? '4px' : '0',
                      }}
                      title={`${item.date}: ${item.count}`}
                    ></div>
                    <span className="text-xs text-gray-600 dark:text-gray-400 mt-2 truncate w-full text-center font-medium">
                      {new Date(item.date).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Reports by Category */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
            <WarningIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            Reportes por Categoría
          </h3>
          <div className="space-y-4">
            {stats.distribution.reportsByCategory.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">No hay datos</p>
            ) : (
              stats.distribution.reportsByCategory.map((item) => {
                const total = stats.distribution.reportsByCategory.reduce(
                  (sum, cat) => sum + cat.count,
                  0
                );
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div
                    key={item.category}
                    className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {item.category}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {item.count}{' '}
                        <span className="text-gray-500 dark:text-gray-400">
                          ({percentage.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-primary-500 to-primary-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* User Status Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
            <UsersIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            Estado de Usuarios
          </h3>
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  Activos
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {stats.distribution.userStatus.active}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                  style={{
                    width: `${
                      (stats.distribution.userStatus.active /
                        (stats.distribution.userStatus.active +
                          stats.distribution.userStatus.banned +
                          stats.distribution.userStatus.verified)) *
                      100
                    }%`,
                  }}
                ></div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  Baneados
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {stats.distribution.userStatus.banned}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-red-500 to-red-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                  style={{
                    width: `${
                      (stats.distribution.userStatus.banned /
                        (stats.distribution.userStatus.active +
                          stats.distribution.userStatus.banned +
                          stats.distribution.userStatus.verified)) *
                      100
                    }%`,
                  }}
                ></div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  Verificados
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {stats.distribution.userStatus.verified}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                  style={{
                    width: `${
                      (stats.distribution.userStatus.verified /
                        (stats.distribution.userStatus.active +
                          stats.distribution.userStatus.banned +
                          stats.distribution.userStatus.verified)) *
                      100
                    }%`,
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Reported Users */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
          <WarningIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          Usuarios Más Reportados
        </h3>
        {stats.topReportedUsers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">No hay datos</p>
        ) : (
          <div className="space-y-3">
            {stats.topReportedUsers.map((user, index) => (
              <div
                key={user.userId}
                className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0
                        ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
                        : index === 1
                          ? 'bg-gradient-to-br from-gray-400 to-gray-500'
                          : index === 2
                            ? 'bg-gradient-to-br from-orange-600 to-orange-700'
                            : 'bg-gradient-to-br from-gray-500 to-gray-600'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
                  </div>
                </div>
                <span className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-full text-sm font-bold shadow-sm">
                  {user.reportsCount} reporte{user.reportsCount !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity by Hour */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
          <ClockIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          Actividad por Hora del Día
        </h3>
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-5 rounded-xl border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-end gap-1.5 h-52 bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
            {stats.activityByHour.map((item) => {
              const maxHourActivity = Math.max(...stats.activityByHour.map((h) => h.count), 1);
              return (
                <div key={item.hour} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-gradient-to-t from-indigo-600 to-indigo-500 rounded-t-lg transition-all hover:from-indigo-700 hover:to-indigo-600 shadow-md hover:shadow-lg cursor-pointer"
                    style={{
                      height: `${(item.count / maxHourActivity) * 100}%`,
                      minHeight: item.count > 0 ? '4px' : '0',
                    }}
                    title={`${item.hour}:00 - ${item.count} mensajes`}
                  ></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400 mt-2 font-medium">
                    {item.hour}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
