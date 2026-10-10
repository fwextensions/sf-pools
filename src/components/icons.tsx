import React from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

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

/** the chevron on pickers and expanders; points up when open. Lucide's
    chevron fills half its box, so a 16px icon draws about 8x4 and the
    negative margins keep the box from padding out the control. */
export function Chevron({ open = false, className = "" }: { open?: boolean; className?: string }) {
	return (
		<ChevronDown
			aria-hidden
			className={`-mx-0.5 -my-1 inline-block h-4 w-4 flex-none ${open ? "rotate-180" : ""} ${className}`}
		/>
	);
}

/** Lucide's external-link icon, sized to the link text beside it. It
    replaces the ↗ arrow, which iOS draws as a heavy emoji. */
export function ExternalLinkIcon({ className = "" }: { className?: string }) {
	return (
		<ExternalLink
			aria-hidden
			className={`ml-[0.3em] inline-block h-[0.9em] w-[0.9em] flex-none align-[-0.1em] ${className}`}
		/>
	);
}
