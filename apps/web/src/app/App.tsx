import { DesignSystemShowcasePage } from './DesignSystemShowcasePage.tsx';
import { ThemeProvider } from './theme/ThemeProvider.tsx';

export function App() {
  return (
    <ThemeProvider>
      <DesignSystemShowcasePage />
    </ThemeProvider>
  );
}
