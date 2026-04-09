export interface ThemeColors {
  accent: string;
  text: string;
  muted: string;
  background: string;
  border: string;
}

export function getThemeColors(): ThemeColors {
  const style = getComputedStyle(document.body);
  return {
    accent:     style.getPropertyValue("--interactive-accent").trim(),
    text:       style.getPropertyValue("--text-normal").trim(),
    muted:      style.getPropertyValue("--text-muted").trim(),
    background: style.getPropertyValue("--background-primary").trim(),
    border:     style.getPropertyValue("--background-modifier-border").trim(),
  };
}
