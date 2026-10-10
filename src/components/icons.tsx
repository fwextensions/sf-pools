import React from "react";

type IconProps = {
	className?: string;
	strokeWidth?: number;
};

export const WaveIcon: React.FC<IconProps> = ({ className = "h-5 w-5", strokeWidth = 1.75 }) => (
	<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
		<path d="M2 16c2.5-1 5.5-1 8 0s5.5 1 8 0 3.5-1 4-1" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

export const ClockIcon: React.FC<IconProps> = ({ className = "h-4 w-4", strokeWidth = 1.75 }) => (
	<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
		<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} />
		<path d="M12 7v5l3 2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

export const MapPinIcon: React.FC<IconProps> = ({ className = "h-4 w-4", strokeWidth = 1.75 }) => (
	<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
		<path d="M12 22s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
		<circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth={strokeWidth} />
	</svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ className = "h-4 w-4", strokeWidth = 1.75 }) => (
	<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
		<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
		<path d="M7 3v4M17 3v4M3 9h18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
	</svg>
);

/** the 6px chevron on pickers and expanders; points up when open */
export function Chevron({ open = false, className = "" }: { open?: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 10 6"
			fill="none"
			aria-hidden
			className={`inline-block h-[6px] w-[10px] flex-none ${open ? "rotate-180" : ""} ${className}`}
		>
			<path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/** Lucide's external-link icon (lucide.dev, ISC), sized to the link text
    beside it. It replaces the ↗ arrow, which iOS draws as a heavy emoji. */
export function ExternalLinkIcon({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
			className={`ml-[0.3em] inline-block h-[0.9em] w-[0.9em] flex-none align-[-0.1em] ${className}`}
		>
			<path d="M15 3h6v6" />
			<path d="M10 14 21 3" />
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		</svg>
	);
}
