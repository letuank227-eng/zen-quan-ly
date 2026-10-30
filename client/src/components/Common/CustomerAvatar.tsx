import React, { useState, useEffect } from 'react';

interface CustomerAvatarProps {
  name?: string;
  avatar?: string | null;
  metaId?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  className?: string;
}

const COLOR_PALETTE = [
  'bg-emerald-600',
  'bg-teal-600',
  'bg-cyan-600',
  'bg-blue-600',
  'bg-indigo-600',
  'bg-violet-600',
  'bg-purple-600',
  'bg-rose-600',
  'bg-amber-600',
];

function getAvatarColor(name?: string): string {
  if (!name) return COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

const SIZE_CLASSES = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-14 h-14 text-xl',
};

export const CustomerAvatar: React.FC<CustomerAvatarProps> = ({
  name,
  avatar,
  metaId,
  size = 'md',
  shape = 'circle',
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);
  const [triedProxy, setTriedProxy] = useState(false);

  const canUseProxy = Boolean(metaId && !metaId.startsWith('user_') && /^\d+$/.test(metaId));
  const proxyUrl = canUseProxy ? `/api/meta/avatar/${metaId}` : null;

  useEffect(() => {
    setImageError(false);
    setTriedProxy(false);
  }, [avatar, metaId]);

  const initial = (name?.trim() ? name.trim()[0] : 'K').toUpperCase();
  const bgColor = getAvatarColor(name);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  const currentSrc = !imageError
    ? avatar || proxyUrl
    : !triedProxy && avatar && proxyUrl
    ? proxyUrl
    : null;

  if (currentSrc) {
    return (
      <img
        src={currentSrc}
        alt={name || 'Khách hàng'}
        onError={() => {
          if (!imageError && avatar && proxyUrl) {
            setImageError(true);
          } else {
            setImageError(true);
            setTriedProxy(true);
          }
        }}
        className={`${sizeClass} ${shapeClass} object-cover border border-slate-200/90 shadow-sm shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${shapeClass} ${bgColor} text-white font-bold flex items-center justify-center shrink-0 shadow-sm select-none ${className}`}
      title={name || 'Khách hàng'}
    >
      {initial}
    </div>
  );
};

export default CustomerAvatar;
