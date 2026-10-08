import type { Closure } from "@/lib/closures";
import { formatScheduleDate } from "@/lib/utils";
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
		<div className="font-sans border-l-[3px] border-alert bg-alert-tint px-3 py-2.5">
			<div className="font-mono text-label font-semibold tracking-[.08em] text-alert">
				<span aria-hidden className="status-dot ring-2 ring-alert ring-inset" />
				CLOSED
			</div>
			<p className="mt-1 text-body font-medium text-ink">
				{poolName ? `${poolName} is closed` : "Closed"}
				{period ? ` ${period}` : ""}
				{closure.reason ? ` for ${closure.reason}` : ""}
			</p>
			<p className="mt-0.5 text-small text-ink-2">
				{closure.endDate
					? `Schedules resume after ${formatReopenDate(closure.endDate)}.`
					: "No reopening date has been announced."}
			</p>
			{closure.sourceUrl ? (
				<a
					href={closure.sourceUrl}
					target="_blank"
					rel="noreferrer"
					className="link-utility mt-1.5 inline-block"
				>
					Read the notice ↗
				</a>
			) : null}
		</div>
	);
}

function formatReopenDate(endDate: string): string {
	return formatScheduleDate(endDate, { month: "long", day: "numeric" });
}
