import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Button } from './Button.tsx';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      {isDark ? (
        <>
          <Sun className="h-4 w-4" aria-hidden="true" />
          <span>Tema claro</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4" aria-hidden="true" />
          <span>Tema oscuro</span>
        </>
      )}
    </Button>
  );
}
