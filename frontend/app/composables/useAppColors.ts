import { appColors } from '~/helpers/constants';

/** Get theme color name by index (-2 = primary, -1 = none, 0+ = color index) */
function getAppAccent(index: number = 0, defaultPrimary?: boolean): string {
  if ((defaultPrimary && index < 0) || index == -2) return 'primary';
  if (index == -1) return '';
  return appColors[index % appColors.length] || 'primary';
}

/** Apply a theme color to CSS custom properties */
function setAppColor(color: string | number) {
  if (typeof color === 'number') {
    color = getAppAccent(color);
  }
  if (!import.meta.client) return;
  if (color === 'primary') color = 'accent';
  document.documentElement.style.setProperty('--primary', `var(--${color})`);
  document.documentElement.style.setProperty('--primary-dark', `var(--${color}-dark)`);
  document.documentElement.style.setProperty('--primary-bg', `var(--${color}-bg)`);
  document.documentElement.style.setProperty('--primary-border', `var(--${color}-border)`);
  setThemeColor('--primary');

  const colorMode = useColorMode();
  usePreferencesStore().set('darkMode', colorMode.value === 'dark');
  document.body.style.colorScheme = colorMode.value;
}

const themeColor = ref('#6254c7');

function setThemeColor(cssVar: string) {
  const computedColor = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  themeColor.value = computedColor;
}

export const useAppColors = () => {
  return {
    getAppAccent,
    setAppColor,
    themeColor,
  };
};
