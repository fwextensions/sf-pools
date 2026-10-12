import { formatScheduledClosure, pacificToday, type ScheduledClosure } from "@/lib/closures";

type Props = {
	closures: ScheduledClosure[];
};

/**
 * The dates a pool's PDF says it's closed (holidays, training, maintenance),
 * listed under its schedule. The schedule itself stays the regular week; the
 * week grid and Now & Soon are where these dates hide sessions.
 */
export default function ScheduledClosures({ closures }: Props) {
	const today = pacificToday();
	const upcoming = closures
		.filter((c) => c.endDate >= today)
		.sort((a, b) => a.startDate.localeCompare(b.startDate));
	if (!upcoming.length) return null;

	return (
		<p className="mt-1.5 text-small text-ink-2">
			<span className="mr-2 font-mono text-label font-semibold tracking-[.08em] text-alert">CLOSED</span>
			{upcoming.map((c, i) => (
				<span key={i}>
					{i > 0 ? " · " : ""}
					<span className="whitespace-nowrap font-medium text-ink">{formatScheduledClosure(c)}</span>
					{c.reason ? ` ${c.reason}` : ""}
				</span>
			))}
		</p>
	);
}
