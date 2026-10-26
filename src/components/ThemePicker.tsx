"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export type ThemeChoice = "system" | "light" | "dark";

// "system" removes the stored pick and data-theme both, so the
// prefers-color-scheme rules in globals.css decide.
const STORAGE_KEY = THEME_STORAGE_KEY;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function readChoice(): ThemeChoice {
	const theme = document.documentElement.dataset.theme;
	return theme === "light" || theme === "dark" ? theme : "system";
}

function setChoice(choice: ThemeChoice) {
	const root = document.documentElement;
	try {
		if (choice === "system") localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, choice);
	} catch {
		// private mode: the pick still holds for this page view
	}
	if (choice === "system") delete root.dataset.theme;
	else root.dataset.theme = choice;
	listeners.forEach((listener) => listener());
}

const OPTIONS: [ThemeChoice, string][] = [
	["system", "Auto"],
	["light", "Light"],
	["dark", "Dark"],
];

export default function ThemePicker() {
	const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

	return (
		<div role="group" aria-label="Theme" className="flex items-center gap-3">
			<span className="font-mono text-label font-medium tracking-[.08em] text-ink-2">THEME</span>
			<div className="flex">
				{OPTIONS.map(([value, label], i) => (
					<button
						key={value}
						type="button"
						aria-pressed={choice === value}
						onClick={() => setChoice(value)}
						className={`control text-small ${i > 0 ? "-ml-px" : ""} ${
							choice === value ? "relative z-10 border-ink text-on-ink" : "text-ink"
						}`}
						// inline, since the control utility sets its own page background
						style={choice === value ? { background: "var(--color-ink)" } : undefined}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
}
