import React from 'react';

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  textClassName?: string;
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 32, 
  showText = true, 
  className = "", 
  textClassName = "text-slate-900 dark:text-white" 
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="nexusGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563eb" /> {/* Blue-600 */}
            <stop offset="100%" stopColor="#7c3aed" /> {/* Violet-600 */}
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        
        {/* Background Container */}
        <rect x="0" y="0" width="100" height="100" rx="24" fill="url(#nexusGradient)" />
        
        {/* Abstract N / Circuit Design */}
        <path 
          d="M30 30 V70 M70 30 V70 M30 30 L70 70" 
          stroke="white" 
          strokeWidth="12" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          opacity="0.9"
        />
        
        {/* Connection Dots */}
        <circle cx="30" cy="30" r="4" fill="white" />
        <circle cx="70" cy="70" r="4" fill="white" />
        <circle cx="30" cy="70" r="4" fill="white" opacity="0.5" />
        <circle cx="70" cy="30" r="4" fill="white" opacity="0.5" />
      </svg>
      
      {showText && (
        <div className={`font-bold tracking-tight leading-none ${textClassName}`}>
          <span className="block text-[1.1em]">NEXUS</span>
          <span className="block text-[0.4em] font-medium tracking-widest uppercase opacity-70">Enterprise OS</span>
        </div>
      )}
    </div>
  );
};