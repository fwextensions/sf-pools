"use client";

import Link from "next/link";
import { formatGridQuery, presetGridQuery, type GridUrlState } from "@/lib/grid/url";

/** a link to the week grid that opens it on the given filter */
export default function GridLink({
	state,
	className,
	children,
}: {
	state: GridUrlState;
	className?: string;
	children: React.ReactNode;
}) {
	const qs = formatGridQuery(state);
	return (
		<Link href={qs ? `/?${qs}` : "/"} className={className} onClick={() => presetGridQuery(state)}>
			{children}
		</Link>
	);
}
