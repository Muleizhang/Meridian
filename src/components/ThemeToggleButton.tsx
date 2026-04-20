'use client';

import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/cn';

export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={cn('meridian-button meridian-button--secondary px-3 py-2 text-sm', className)}
      onClick={toggleTheme}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      {isDark ? '浅色' : '深色'}
    </button>
  );
}
