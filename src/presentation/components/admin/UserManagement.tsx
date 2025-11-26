import { useState, useEffect, useCallback } from 'react';
import { adminService, type UserListItem } from '@infrastructure/api/admin-service';
import { Button } from '../Button';
import { Avatar } from '../Avatar';
import { UserDetailsModal } from './UserDetailsModal';
import { MagnifyingGlassIcon, FunnelIcon, UsersIcon } from '../Icons';

export function UserManagement(): JSX.Element {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBanned, setFilterBanned] = useState<string>('all');
  const [filterVerified, setFilterVerified] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  const loadUsers = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await adminService.getUsers({
        limit,
        offset: currentPage * limit,
        search: searchTerm || undefined,
        isBanned: filterBanned === 'all' ? undefined : filterBanned === 'banned',
        emailVerified: filterVerified === 'all' ? undefined : filterVerified === 'verified',
        role: filterRole === 'all' ? undefined : (filterRole as 'USER' | 'ADMIN'),
      });
      setUsers(response.users);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar usuarios';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchTerm, filterBanned, filterVerified, filterRole]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleSearch = (value: string): void => {
    setSearchTerm(value);
    setCurrentPage(0);
  };

  const handleFilterChange = (): void => {
    setCurrentPage(0);
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg transition-colors border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <UsersIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, username o email..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <FunnelIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Filtros:</span>
          </div>
          <select
            value={filterBanned}
            onChange={(e) => {
              setFilterBanned(e.target.value);
              handleFilterChange();
            }}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="banned">Baneados</option>
          </select>
          <select
            value={filterVerified}
            onChange={(e) => {
              setFilterVerified(e.target.value);
              handleFilterChange();
            }}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos</option>
            <option value="verified">Verificados</option>
            <option value="unverified">No verificados</option>
          </select>
          <select
            value={filterRole}
            onChange={(e) => {
              setFilterRole(e.target.value);
              handleFilterChange();
            }}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los roles</option>
            <option value="USER">Usuario</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
        {total > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {users.length} de {total} usuarios
          </p>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg transition-colors overflow-hidden border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Cargando usuarios...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-4">
              {error}
            </div>
            <Button onClick={loadUsers}>Reintentar</Button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-600 dark:text-gray-400">
            No se encontraron usuarios.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-700/30">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Estadísticas
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all cursor-pointer border-l-4 border-transparent hover:border-primary-500"
                      onClick={() => setSelectedUser(user)}
                    >
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} avatar={user.avatar} size="md" />
                          <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                              {user.name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              @{user.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">{user.email}</div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex flex-wrap gap-2">
                          {user.isBanned && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 shadow-sm">
                              Baneado
                            </span>
                          )}
                          {user.emailVerified && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 shadow-sm">
                              Verificado
                            </span>
                          )}
                          {user.role === 'ADMIN' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 shadow-sm">
                              Admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="space-y-1.5 text-sm">
                          <div className="text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">{user.stats.sessionsCount}</span>{' '}
                            sesiones
                          </div>
                          <div className="text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">{user.stats.reportsReceived}</span>{' '}
                            reportes
                          </div>
                          <div className="text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">{user.stats.messagesCount}</span>{' '}
                            mensajes
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-medium">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                          }}
                          className="shrink-0"
                        >
                          Ver Detalles
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      {/* User Details Modal */}
      {selectedUser && (
        <UserDetailsModal
          userId={selectedUser.id}
          onClose={() => setSelectedUser(null)}
          onUserUpdated={loadUsers}
        />
      )}
    </div>
  );
}
