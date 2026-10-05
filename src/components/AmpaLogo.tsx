import React from 'react';

interface AmpaLogoProps {
  className?: string;
  variant?: 'full' | 'mark-only' | 'badge-ag';
  inverted?: boolean;
}

export const AmpaLogo: React.FC<AmpaLogoProps> = ({
  className = 'h-10 w-auto',
}) => (
  <img
    src="/logo-ampa-corporate.webp"
    alt="AMPA Agustinos Granada"
    className={`select-none object-contain ${className}`}
    draggable={false}
    decoding="async"
  />
);
