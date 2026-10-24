"use client";

import { useSyncExternalStore } from "react";
import { ExternalLinkIcon } from "@/components/icons";

// Apple Maps links open the Maps app on iPhones, iPads and Macs, but only a
// web page elsewhere, so the link shows only on Apple devices. iPadOS reports
// itself as a Mac, so "Macintosh" covers it too. The server can't know the
// device, so the static page renders without the link and it appears after
// hydration.
const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

// the device never changes, so there's nothing to subscribe to
function subscribeNever() {
	return () => {};
}

export default function AppleMapsLink({
	name,
	address,
	className,
}: {
	name: string;
	address: string;
	className?: string;
}) {
	const show = useSyncExternalStore(subscribeNever, isApple, () => false);
	if (!show) return null;

	const href = `https://maps.apple.com/?q=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`;
	return (
		<a href={href} target="_blank" rel="noreferrer" className={className}>
			Apple Maps<ExternalLinkIcon />
		</a>
	);
}
