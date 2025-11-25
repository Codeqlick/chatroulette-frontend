import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { userService, PublicUserProfile, UserStats } from '@infrastructure/api/user-service';
import { blockService } from '@infrastructure/api/block-service';
import { useAuthStore } from '@application/stores/auth-store';
import { Button } from '../components/Button';
import { AppHeader } from '../components/AppHeader';
import { ReportModal } from '../components/ReportModal';
import { Avatar } from '../components/Avatar';
import { UserProfileCard } from '../components/UserProfileCard';
import { logger } from '@infrastructure/logging/frontend-logger';

export function ProfilePage(): JSX.Element {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Check if this is the current user's profile
  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    const fetchProfile = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        const [profileData, statsData] = await Promise.all([
          userService.getPublicProfile(username).catch((err: AxiosError) => {
            logger.error('Error loading profile', { error: err, username });
            if (err.response?.status === 401) {
              setError('Debes iniciar sesión para ver perfiles');
            } else if (err.response?.status === 404) {
              setError('Usuario no encontrado');
            } else if (err.response?.status === 403) {
              setError('No tienes permisos para ver este perfil');
            } else {
              setError(
                `Error al cargar el perfil (${err.response?.status || 'desconocido'}). Por favor, intenta nuevamente.`
              );
            }
            return null;
          }),
          userService.getUserStats(username).catch((err: AxiosError) => {
            logger.error('Error loading stats', { error: err, username });
            // Stats are optional, don't set error for stats failure
            return null;
          }),
        ]);

        if (profileData) {
          setProfile(profileData);
        }
        if (statsData) {
          setStats(statsData);
        }
      } catch (err: unknown) {
        logger.error('Error fetching profile', { error: err, username });
        if (!error) {
          setError('Error al cargar el perfil');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, navigate]);

  const handleShare = async (): Promise<void> => {
    try {
      const profileUrl = `${window.location.origin}/profile/${username}`;
      await navigator.clipboard.writeText(profileUrl);
      setIsSharing(true);
      setTimeout(() => setIsSharing(false), 2000);
    } catch (err) {
      logger.error('Error sharing profile', { error: err, username });
    }
  };

  const handleBlock = async (): Promise<void> => {
    if (!username) return;

    try {
      await blockService.blockUser(username);
      navigate('/videochat');
    } catch (err) {
      logger.error('Error blocking user', { error: err, username });
      alert('Error al bloquear usuario. Intenta nuevamente.');
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header - Consistent with ChatWindow style */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3.5 xl:py-4 min-w-0 gap-4">
            <div className="flex items-center gap-3 xl:gap-4 min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex-shrink-0">
                Chatroulette
              </h1>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 flex-shrink-0"></div>
              {profile && (
                <div className="flex-1 min-w-0">
                  <UserProfileCard
                    name={profile.name}
                    username={profile.username}
                    avatar={profile.avatar}
                    size="md"
                    showUsername={true}
                    showConnectionStatus={false}
                    className="border-0 shadow-none bg-transparent p-0"
                  />
                </div>
              )}
              {!profile && !loading && !error && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Cargando perfil...</p>
                </div>
              )}
              {loading && (
                <div className="flex-1 min-w-0">
                  <div className="h-8 w-48 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
              )}
            </div>
            {/* App Header - User menu */}
            <AppHeader
              className="flex-shrink-0 border-0 shadow-none bg-transparent"
              showLogo={false}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <Button onClick={() => navigate(-1)} className="mb-6" variant="secondary">
          ← Volver
        </Button>

        {/* Profile Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
          {/* Header - Simple title */}
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Perfil de Usuario
            </h1>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {loading ? (
              <div className="space-y-6">
                {/* Skeleton Loader */}
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-32 h-32 rounded-full bg-gray-300 dark:bg-gray-700 animate-pulse"></div>
                  <div className="h-8 w-48 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-4 w-32 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
                <div className="space-y-4">
                  <div className="h-20 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-24 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div className="h-24 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <div className="text-red-500 text-4xl mb-4">⚠️</div>
                <p className="text-red-500 dark:text-red-400 mb-4">{error}</p>
                <Button onClick={() => navigate('/videochat')}>Volver a Videochat</Button>
              </div>
            ) : profile ? (
              <>
                {/* Avatar Section */}
                <div className="flex flex-col items-center animate-fade-in-up">
                  <Avatar
                    name={profile.name}
                    avatar={profile.avatar}
                    size="xl"
                    showRing={true}
                    ringColor="default"
                    className="shadow-xl"
                  />
                  <h3 className="mt-5 text-3xl font-bold text-gray-900 dark:text-white text-center">
                    {profile.name}
                  </h3>
                  <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
                    @{profile.username}
                  </p>
                </div>

                {/* Bio Section */}
                {profile.bio && (
                  <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                      <div className="flex items-start gap-3">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                          {profile.bio}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats Section */}
                {stats && (
                  <>
                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-up"
                      style={{ animationDelay: '0.2s' }}
                    >
                      {/* Likes Received */}
                      <div className="bg-gradient-to-br from-pink-50 to-rose-100 dark:from-pink-900/30 dark:to-rose-800/30 rounded-lg p-4 border border-pink-200 dark:border-pink-700 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg p-2 bg-pink-500 dark:bg-pink-600">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-6 w-6 text-white"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                              {stats.likesReceived || 0}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {(stats.likesReceived || 0) === 1
                                ? 'Like recibido'
                                : 'Likes recibidos'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Reputation Score */}
                      <div
                        className={`bg-gradient-to-br rounded-lg p-4 border shadow-sm ${
                          stats.reputationScore >= 501
                            ? 'from-yellow-50 to-amber-100 dark:from-yellow-900/30 dark:to-amber-800/30 border-yellow-200 dark:border-yellow-700'
                            : stats.reputationScore >= 101
                              ? 'from-gray-50 to-slate-100 dark:from-gray-700/30 dark:to-slate-800/30 border-gray-200 dark:border-gray-700'
                              : 'from-orange-50 to-amber-100 dark:from-orange-900/30 dark:to-amber-800/30 border-orange-200 dark:border-orange-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`rounded-lg p-2 ${
                              stats.reputationScore >= 501
                                ? 'bg-yellow-500 dark:bg-yellow-600'
                                : stats.reputationScore >= 101
                                  ? 'bg-gray-500 dark:bg-gray-600'
                                  : 'bg-orange-500 dark:bg-orange-600'
                            }`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-6 w-6 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                              {stats.reputationScore}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {stats.reputationScore >= 501
                                ? 'Oro'
                                : stats.reputationScore >= 101
                                  ? 'Plata'
                                  : 'Bronce'}
                            </p>
                            {/* Reputation Progress Bar */}
                            <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  stats.reputationScore >= 501
                                    ? 'bg-yellow-500'
                                    : stats.reputationScore >= 101
                                      ? 'bg-gray-500'
                                      : 'bg-orange-500'
                                }`}
                                style={{
                                  width: `${Math.min(100, (stats.reputationScore / 1000) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Time Active */}
                    <div
                      className="bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-800/30 rounded-lg p-4 border border-blue-200 dark:border-blue-700 shadow-sm animate-fade-in-up"
                      style={{ animationDelay: '0.3s' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg p-2 bg-blue-500 dark:bg-blue-600">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-gray-900 dark:text-white">
                            {stats.daysActive}{' '}
                            {stats.daysActive === 1 ? 'día activo' : 'días activos'}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Miembro desde {formatDate(stats.joinedDate)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Badges Section */}
                    {stats.badges && stats.badges.length > 0 && (
                      <div className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Badges Obtenidos
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {stats.badges.map((badge) => (
                            <div
                              key={badge.id}
                              className="bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-800/30 rounded-lg p-3 border border-purple-200 dark:border-purple-700 shadow-sm hover:shadow-md transition-shadow group relative"
                              title={badge.description}
                            >
                              <div className="flex flex-col items-center gap-2">
                                <div className="text-2xl">{badge.icon}</div>
                                <p className="text-xs font-medium text-gray-900 dark:text-white text-center line-clamp-2">
                                  {badge.name}
                                </p>
                              </div>
                              {/* Tooltip */}
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10 bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                                {badge.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Username Field */}
                <div className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Nombre de Usuario
                    </label>
                    <p className="mt-1 text-xs text-gray-900 dark:text-gray-100 font-mono break-all bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                      {profile.username}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Footer with Actions */}
          {profile && !isOwnProfile && (
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleBlock}
                  variant="secondary"
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 inline mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                  Bloquear
                </Button>
                <Button
                  onClick={() => setIsReportModalOpen(true)}
                  variant="secondary"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 inline mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Reportar
                </Button>
                <Button
                  onClick={handleShare}
                  variant="secondary"
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white"
                  disabled={isSharing}
                >
                  {isSharing ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 inline mr-2"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      ¡Copiado!
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 inline mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                      Compartir
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Report Modal */}
      {username && !isOwnProfile && (
        <ReportModal
          username={username}
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          onReportSubmitted={() => {
            setIsReportModalOpen(false);
            // Optionally show a success message
          }}
        />
      )}
    </div>
  );
}
