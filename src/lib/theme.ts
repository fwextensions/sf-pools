// The site's light and dark themes. The reader's pick, if any, is in
// localStorage and on <html data-theme>; with neither, the system setting
// decides through the prefers-color-scheme rules in globals.css.

export const THEME_STORAGE_KEY = "theme";

// Inlined in the root layout's <head>, so it runs before first paint.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

let systemDark: MediaQueryList | null = null;

// Cheap enough to call every frame: the media query list is made once.
export function isDarkTheme(): boolean {
	const theme = document.documentElement.dataset.theme;
	if (theme) return theme === "dark";
	systemDark ??= window.matchMedia("(prefers-color-scheme: dark)");
	return systemDark.matches;
}
