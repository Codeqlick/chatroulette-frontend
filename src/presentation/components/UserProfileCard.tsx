import { Avatar } from './Avatar';
import { ConnectionStatus, type ConnectionState, type ConnectionQuality } from './ConnectionStatus';

interface UserProfileCardProps {
  name: string;
  username?: string | undefined;
  avatar?: string | null | undefined;
  connectionState?: ConnectionState | undefined;
  connectionQuality?: ConnectionQuality | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined;
  showUsername?: boolean | undefined;
  showConnectionStatus?: boolean | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}

export function UserProfileCard({
  name,
  username,
  avatar,
  connectionState,
  connectionQuality,
  size = 'md',
  showUsername = false,
  showConnectionStatus = false,
  onClick,
  className = '',
}: UserProfileCardProps): JSX.Element {
  const getRingColor = (): 'default' | 'green' | 'yellow' | 'gray' => {
    if (!connectionState) return 'default';
    if (connectionState === 'connected') return 'green';
    if (connectionState === 'connecting') return 'yellow';
    return 'gray';
  };

  const getRingPulse = (): boolean => {
    return connectionState === 'connecting';
  };

  const avatarSizeMap = {
    sm: 'sm' as const,
    md: 'md' as const,
    lg: 'lg' as const,
  };

  const textSizeMap = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const nameSizeMap = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const cardClasses = onClick
    ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200'
    : '';

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md ${cardClasses} ${className}`}
    >
      <Avatar
        name={name}
        avatar={avatar}
        size={avatarSizeMap[size]}
        showRing={!!connectionState}
        ringColor={getRingColor()}
        ringPulse={getRingPulse()}
      />
      <div className="min-w-0 flex-1">
        <h2 className={`font-bold truncate text-gray-900 dark:text-white ${nameSizeMap[size]}`}>
          {name}
        </h2>
        {showUsername && username && (
          <p className={`text-gray-600 dark:text-gray-400 truncate ${textSizeMap[size]}`}>
            @{username}
          </p>
        )}
        {showConnectionStatus && connectionState && (
          <ConnectionStatus state={connectionState} quality={connectionQuality} />
        )}
      </div>
    </div>
  );
}
