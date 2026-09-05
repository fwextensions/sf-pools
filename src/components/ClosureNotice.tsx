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
		<div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
			<div className="flex items-start gap-2">
				<span aria-hidden="true">🚧</span>
				<div>
					<p className="font-medium">
						{poolName ? `${poolName} is closed` : "Closed"}
						{period ? ` ${period}` : ""}
						{closure.reason ? ` for ${closure.reason}` : ""}
					</p>
					{closure.endDate ? (
						<p className="mt-0.5 text-sm">
							Schedules resume after {formatReopenDate(closure.endDate)}.
						</p>
					) : (
						<p className="mt-0.5 text-sm">No reopening date has been announced.</p>
					)}
					{closure.sourceUrl ? (
						<a
							href={closure.sourceUrl}
							target="_blank"
							rel="noreferrer"
							className="mt-2 inline-block text-sm font-medium underline underline-offset-2"
						>
							Read the closure notice
						</a>
					) : null}
				</div>
			</div>
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
