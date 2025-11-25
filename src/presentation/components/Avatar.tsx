interface AvatarProps {
  name: string;
  avatar?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showRing?: boolean;
  ringColor?: 'default' | 'green' | 'yellow' | 'gray';
  ringPulse?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-32 h-32 text-4xl',
};

const ringSizeClasses = {
  xs: 'ring-1',
  sm: 'ring-2',
  md: 'ring-2',
  lg: 'ring-3',
  xl: 'ring-4',
};

const ringColorClasses = {
  default: 'ring-gray-300 dark:ring-gray-600',
  green: 'ring-green-500',
  yellow: 'ring-yellow-500',
  gray: 'ring-gray-400',
};

export function Avatar({
  name,
  avatar,
  size = 'md',
  className = '',
  showRing = false,
  ringColor = 'default',
  ringPulse = false,
}: AvatarProps): JSX.Element {
  const sizeClass = sizeClasses[size];
  const ringSizeClass = showRing ? ringSizeClasses[size] : '';
  const ringColorClass = showRing ? ringColorClasses[ringColor] : '';
  const pulseClass = ringPulse ? 'animate-pulse' : '';

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${ringSizeClass} ${ringColorClass} ${pulseClass} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold flex-shrink-0 ${ringSizeClass} ${ringColorClass} ${pulseClass} ${className}`}
    >
      {name[0]?.toUpperCase() || 'U'}
    </div>
  );
}

