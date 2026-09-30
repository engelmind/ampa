import React from 'react';

interface AmpaLogoProps {
  className?: string;
  variant?: 'full' | 'mark-only' | 'badge-ag';
  inverted?: boolean;
}

export const AmpaLogo: React.FC<AmpaLogoProps> = ({
  className = 'h-10 w-auto',
  variant = 'full',
  inverted = false,
}) => {
  const textColor = inverted ? '#ffffff' : '#1c1917';
  const subtextColor = inverted ? '#f1f5f9' : '#1c1917';
  const dividerColor = inverted ? 'rgba(255,255,255,0.35)' : '#1c1917';
  const flameColor = '#e51a1a';

  if (variant === 'badge-ag') {
    return (
      <div className={`rounded-xl flex items-center justify-center font-black select-none ${inverted ? 'bg-white text-red-600 shadow-sm' : 'bg-red-600 text-white'} ${className}`}>
        <span className="tracking-tighter">AG</span>
      </div>
    );
  }

  if (variant === 'mark-only') {
    return (
      <svg viewBox="0 0 170 170" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Emblema AMPA Agustinos">
        <g transform="translate(10, 4)">
          <path d="M 68 4 C 66 18, 54 26, 58 42 C 63 32, 73 25, 75 14 C 77 24, 88 33, 82 48 C 89 38, 93 24, 87 10 C 83 2, 71 0, 68 4 Z" fill={flameColor}/>
          <path d="M 72 16 C 70 24, 64 28, 67 36 C 70 30, 75 26, 77 20 C 78 26, 83 30, 80 38 C 84 32, 85 24, 81 16 Z" fill="#ff4343"/>
          <path d="M 75 42 C 92 20, 126 22, 140 52 C 154 82, 128 116, 75 158 C 22 116, -4 82, 10 52 C 24 22, 58 20, 75 42 Z" fill="none" stroke={flameColor} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M 124 35 L 148 24 M 132 49 L 158 39" stroke={flameColor} strokeWidth="8" strokeLinecap="round"/>
          <path d="M 116 126 L 152 140 M 123 143 L 146 156" stroke={flameColor} strokeWidth="8" strokeLinecap="round"/>
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 540 190" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="AMPA Agustinos Granada">
      <g transform="translate(15, 10)">
        <path d="M 68 4 C 66 18, 54 26, 58 42 C 63 32, 73 25, 75 14 C 77 24, 88 33, 82 48 C 89 38, 93 24, 87 10 C 83 2, 71 0, 68 4 Z" fill={flameColor}/>
        <path d="M 72 16 C 70 24, 64 28, 67 36 C 70 30, 75 26, 77 20 C 78 26, 83 30, 80 38 C 84 32, 85 24, 81 16 Z" fill="#ff4343"/>
        <path d="M 75 42 C 92 20, 126 22, 140 52 C 154 82, 128 116, 75 158 C 22 116, -4 82, 10 52 C 24 22, 58 20, 75 42 Z" fill="none" stroke={flameColor} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M 124 35 L 148 24 M 132 49 L 158 39" stroke={flameColor} strokeWidth="8" strokeLinecap="round"/>
        <path d="M 116 126 L 152 140 M 123 143 L 146 156" stroke={flameColor} strokeWidth="8" strokeLinecap="round"/>
      </g>
      <line x1="188" y1="28" x2="188" y2="162" stroke={dividerColor} strokeWidth="4.5" strokeLinecap="round"/>
      <text x="216" y="74" fontFamily="'Montserrat', 'Plus Jakarta Sans', system-ui, sans-serif" fontWeight="900" fontSize="54" fill={textColor} letterSpacing="-1.5">AMPA</text>
      <text x="216" y="128" fontFamily="'Montserrat', 'Plus Jakarta Sans', system-ui, sans-serif" fontWeight="800" fontSize="46" fill={textColor} letterSpacing="-0.5">Agustinos</text>
      <text x="218" y="165" fontFamily="'Montserrat', 'Plus Jakarta Sans', system-ui, sans-serif" fontWeight="400" fontSize="32" fill={subtextColor} letterSpacing="2">Granada</text>
    </svg>
  );
};
