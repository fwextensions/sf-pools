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
