"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();
let systemDark: MediaQueryList | null = null;

function getSystemDark() {
	systemDark ??= window.matchMedia("(prefers-color-scheme: dark)");
	return systemDark;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	// the system setting can change under an open page, which flips the
	// theme when the reader hasn't picked one
	getSystemDark().addEventListener("change", listener);
	return () => {
		listeners.delete(listener);
		getSystemDark().removeEventListener("change", listener);
	};
}

function systemTheme(): Theme {
	return getSystemDark().matches ? "dark" : "light";
}

// the theme on screen: the reader's pick on <html data-theme>, else the system's
function currentTheme(): Theme {
	const theme = document.documentElement.dataset.theme;
	return theme === "light" || theme === "dark" ? theme : systemTheme();
}

// Switching to the theme the system already asks for clears the pick rather
// than storing it, so a reader who flips back is following the system again.
function setTheme(theme: Theme) {
	const root = document.documentElement;
	const follow = theme === systemTheme();
	try {
		if (follow) localStorage.removeItem(THEME_STORAGE_KEY);
		else localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// private mode: the pick still holds for this page view
	}
	if (follow) delete root.dataset.theme;
	else root.dataset.theme = theme;
	listeners.forEach((listener) => listener());
}

/**
 * One button that flips between the light and dark themes, showing the
 * theme it switches to. The server doesn't know the theme, so the icon only
 * appears once the page hydrates; the button keeps its size meanwhile.
 */
export default function ThemePicker() {
	const theme = useSyncExternalStore(subscribe, currentTheme, () => null);
	const next: Theme = theme === "dark" ? "light" : "dark";

	return (
		<button
			type="button"
			aria-label={`Switch to the ${next} theme`}
			title={`Switch to the ${next} theme`}
			onClick={() => setTheme(next)}
			className="control w-11 flex-none self-start px-0 text-ink"
		>
			{theme && (next === "dark" ? (
				<Moon aria-hidden className="h-4 w-4" />
			) : (
				<Sun aria-hidden className="h-4 w-4" />
			))}
		</button>
	);
}
