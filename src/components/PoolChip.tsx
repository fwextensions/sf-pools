import type { HTMLAttributes } from "react";
import type { PoolToken } from "@/lib/pool-tokens";

/**
 * A pool's three-letter code on its chip color, the legend every page shares.
 * No fixed size: 5px of padding around 13px mono caps, with `text-box`
 * trimming the line box to the cap height, comes to about 19×33px (about 21px
 * tall where `text-box` isn't supported). The title spells out the pool's
 * name for anyone who hovers a code they don't recognize.
 */
export default function PoolChip({
	token,
	className = "",
	...rest
}: { token: PoolToken | null } & HTMLAttributes<HTMLSpanElement>) {
	return (
		<span
			title={token?.fullName}
			{...rest}
			className={`inline-block flex-none p-[5px] font-mono text-time font-semibold leading-none [text-box:trim-both_cap_alphabetic] ${className}`}
			style={{
				background: token?.chip ?? "var(--color-ink-2)",
				color: token?.chipText ?? "#fff",
			}}
		>
			{token?.code ?? "—"}
		</span>
	);
}
