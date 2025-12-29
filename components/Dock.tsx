import React, { useEffect, useRef, useState, ReactElement } from 'react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence, MotionValue } from 'framer-motion';

// Interfaces
interface DockItemProps {
  icon: React.ReactNode;
  label: React.ReactNode;
  className?: string;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: { mass: number; stiffness: number; damping: number };
  distance: number;
  magnification: number;
  baseItemSize: number;
}

interface DockLabelProps {
  children: React.ReactNode;
  className?: string;
  isHovered: MotionValue<number>;
}

interface DockProps {
  items: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    className?: string;
  }[];
  className?: string;
  spring?: { mass: number; stiffness: number; damping: number };
  magnification?: number;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
}

const DockIcon: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => {
  return <div className={`flex items-center justify-center ${className}`}>{children}</div>;
}

const DockLabel: React.FC<DockLabelProps> = ({ children, className = '', isHovered }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, x: '-50%' }}
          animate={{ opacity: 1, y: -50, x: '-50%' }}
          exit={{ opacity: 0, y: 10, x: '-50%' }}
          transition={{ duration: 0.2 }}
          className={`
            absolute top-0 left-1/2 -translate-x-1/2 w-max whitespace-pre 
            rounded-md border border-slate-200 dark:border-slate-700 
            bg-slate-900 dark:bg-white px-2 py-1 text-xs text-white dark:text-slate-900 
            font-medium shadow-xl z-50 pointer-events-none
            ${className}
          `}
          role="tooltip"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const DockItem: React.FC<DockItemProps> = ({ icon, label, className = '', onClick, mouseX, spring, distance, magnification, baseItemSize }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize
    };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center rounded-full 
        bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 
        shadow-lg cursor-pointer outline-none transition-colors duration-200
        hover:border-blue-400 dark:hover:border-blue-500
        ${className}
      `}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      <DockIcon className="text-slate-600 dark:text-slate-300">{icon}</DockIcon>
      <DockLabel isHovered={isHovered}>{label}</DockLabel>
    </motion.div>
  );
}

const Dock: React.FC<DockProps> = ({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 80, // Tamanho expandido
  distance = 140,     // Área de influência do mouse
  panelHeight = 68,
  baseItemSize = 50   // Tamanho base
}) => {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div 
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-end w-full max-w-full justify-center pointer-events-none"
      style={{ height: panelHeight }}
    >
      <motion.div
        onMouseMove={({ pageX }) => {
          mouseX.set(pageX);
        }}
        onMouseLeave={() => {
          mouseX.set(Infinity);
        }}
        className={`
          pointer-events-auto flex items-end gap-3 rounded-2xl 
          bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl 
          border border-slate-200 dark:border-slate-800 
          px-4 pb-3 pt-3 shadow-2xl
          ${className}
        `}
      >
        {items.map((item, index) => (
          <DockItem
            key={index}
            icon={item.icon}
            label={item.label}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseItemSize={baseItemSize}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}

export default Dock;