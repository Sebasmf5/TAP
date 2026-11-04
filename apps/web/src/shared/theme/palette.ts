export type ThemeMode = 'light' | 'dark';

export interface ThemeTokens {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  textHeading: string;
  textBody: string;
  textMuted: string;
  textSubtle: string;
  action: string;
  actionText: string;
  actionHover: string;
  link: string;
  focusRing: string;
  statusSuccessBg: string;
  statusSuccessText: string;
  statusDangerBg: string;
  statusDangerText: string;
  statusWarningBg: string;
  statusWarningText: string;
  statusInfoBg: string;
  statusInfoText: string;
  chartSeries: readonly [string, string, string, string, string];
}

export const THEME_TOKENS: Record<ThemeMode, ThemeTokens> = {
  light: {
    canvas: '#ffffff',
    surface: '#ffffff',
    surfaceRaised: '#f8fafd',
    surfaceHover: '#e5edf5',
    border: '#e5edf5',
    borderStrong: '#64748d',
    textHeading: '#061b31',
    textBody: '#273951',
    textMuted: '#64748d',
    textSubtle: '#64748d',
    action: '#533afd',
    actionText: '#ffffff',
    actionHover: '#3f27d8',
    link: '#533afd',
    focusRing: '#533afd',
    statusSuccessBg: '#ecfdf3',
    statusSuccessText: '#166534',
    statusDangerBg: '#fef2f2',
    statusDangerText: '#991b1b',
    statusWarningBg: '#fffbeb',
    statusWarningText: '#92400e',
    statusInfoBg: '#f8fafd',
    statusInfoText: '#273951',
    chartSeries: ['#533afd', '#6b5be2', '#182659', '#64748d', '#061b31'],
  },
  dark: {
    canvas: '#08090a',
    surface: '#0f1011',
    surfaceRaised: '#161718',
    surfaceHover: '#23252a',
    border: '#23252a',
    borderStrong: '#62666d',
    textHeading: '#ffffff',
    textBody: '#d0d6e0',
    textMuted: '#8a8f98',
    textSubtle: '#62666d',
    action: '#e4f222',
    actionText: '#08090a',
    actionHover: '#cad819',
    link: '#d0d6e0',
    focusRing: '#d0d6e0',
    statusSuccessBg: '#0d2818',
    statusSuccessText: '#5cd679',
    statusDangerBg: '#2d1215',
    statusDangerText: '#ff8a8a',
    statusWarningBg: '#2b2108',
    statusWarningText: '#facc15',
    statusInfoBg: '#161718',
    statusInfoText: '#d0d6e0',
    chartSeries: ['#e4f222', '#02b8cc', '#8b5cf6', '#27a644', '#8a8f98'],
  },
};
