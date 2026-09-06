import type { Closure } from "@/lib/closures";
import { formatClosurePeriod } from "@/lib/closures";

type Props = {
	closure: Closure;
	/** shown before the notice when the pool isn't already identified in context */
	poolName?: string;
};

/**
 * Stands in for a closed pool's schedule. The period is rendered from the dates
 * parsed out of the notice rather than echoing the raw document title, and the
 * notice itself is linked when SF Rec & Park published one.
 */
export default function ClosureNotice({ closure, poolName }: Props) {
	const period = formatClosurePeriod(closure);

	return (
		<div className="plex-sans border-l-[3px] border-[#c98a1e] bg-[#fdf7ec] px-3 py-2.5">
			<div className="plex-mono text-[10px] font-semibold tracking-[.14em] text-[#a9761c]">
				CLOSED
			</div>
			<p className="mt-1 text-[14px] font-medium text-[#0e2733]">
				{poolName ? `${poolName} is closed` : "Closed"}
				{period ? ` ${period}` : ""}
				{closure.reason ? ` for ${closure.reason}` : ""}
			</p>
			<p className="mt-0.5 text-[13px] text-[#5a707c]">
				{closure.endDate
					? `Schedules resume after ${formatReopenDate(closure.endDate)}.`
					: "No reopening date has been announced."}
			</p>
			{closure.sourceUrl ? (
				<a
					href={closure.sourceUrl}
					target="_blank"
					rel="noreferrer"
					className="mt-1.5 inline-block plex-mono text-[11px] font-medium text-[#5a707c] underline underline-offset-2"
				>
					READ THE NOTICE ↗
				</a>
			) : null}
		</div>
	);
}

function formatReopenDate(endDate: string): string {
	const [y, m, d] = endDate.split("-").map(Number);
	return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
}
