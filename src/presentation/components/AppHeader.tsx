import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@application/stores/auth-store';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './Avatar';

interface AppHeaderProps {
  className?: string;
  showLogo?: boolean; // Mostrar logo o no
  showControls?: boolean; // Para páginas que necesitan controles adicionales (reservado para uso futuro)
  children?: React.ReactNode; // Slot para controles personalizados si se necesita en el futuro
}

export function AppHeader({ className = '', showLogo = true, showControls = false, children }: AppHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Cerrar dropdown al navegar
  useEffect(() => {
    setIsDropdownOpen(false);
  }, [navigate]);

  const handleLogout = (): void => {
    logout();
    navigate('/');
  };

  const handleViewProfile = (): void => {
    if (user?.username) {
      navigate(`/profile/${user.username}`);
    }
    setIsDropdownOpen(false);
  };

  const handleNavigateToAdmin = (): void => {
    navigate('/admin');
    setIsDropdownOpen(false);
  };

  if (!user) {
    return <></>;
  }

  return (
    <div
      className={`flex items-center ${showLogo ? 'justify-between' : 'justify-end'} ${className}`}
    >
      {/* Logo/App Name - Left */}
      {showLogo && (
        <div className="flex items-center">
          <button
            onClick={() => navigate('/videochat')}
            className="text-xl font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            Chatroulette
          </button>
        </div>
      )}

      {/* Right Section */}
      <div className="flex items-center gap-3">
        {/* Custom Controls Slot - for future use */}
        {showControls && children && (
          <div className="flex items-center gap-2">
            {children}
          </div>
        )}
        {/* User Avatar and Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 hover:bg-white/10 dark:hover:bg-white/10 transition-colors group text-white dark:text-white"
            aria-label="Menú de usuario"
          >
            {/* Avatar */}
            <Avatar
              name={user.name}
              avatar={user.avatar}
              size="sm"
              showRing={true}
              ringColor="default"
              className="group-hover:ring-primary-500 transition-all"
            />

            {/* Name - Hidden on mobile */}
            <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-white dark:group-hover:text-white">
              {user.name}
            </span>

            {/* Dropdown Icon */}
            <svg
              className={`w-4 h-4 text-gray-500 dark:text-gray-400 text-white dark:text-white transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50 animate-scale-in">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <button
                  onClick={handleViewProfile}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
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
                  Ver mi perfil
                </button>

                {user.role === 'ADMIN' && (
                  <button
                    onClick={handleNavigateToAdmin}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                    Panel Admin
                  </button>
                )}

                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                {/* Theme Toggle */}
                <div className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Tema</span>
                    <ThemeToggle />
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Cerrar Sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

