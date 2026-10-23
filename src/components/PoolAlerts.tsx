import type { AlertsData } from "@/lib/site-data";
import { PoolSchedule } from "@/lib/pdf-processor";
import ClosureNotice from "@/components/ClosureNotice";
import type { ClosureWindow, ScheduleGap, SharedClosure } from "@/lib/pool-calendar";
import { formatScheduleDate } from "@/lib/utils";

type Props = {
	alerts?: AlertsData | null;
	pools: PoolSchedule[];
	selectedPools: string[];
	/** closures from the PDFs' notes that fall in the week the grid shows */
	weekClosures?: SharedClosure[];
	/** printed schedules that end or start inside that week */
	scheduleGaps?: ScheduleGap[];
	/** the first date the grid shows */
	from?: string;
}

export default function PoolAlerts({ alerts, pools, selectedPools, weekClosures = [], scheduleGaps = [], from = "" }: Props) {
	const poolAlerts = alerts?.poolAlerts ?? [];
	// a closure shows when any pool it names is in the filter
	const relevantClosures = weekClosures
		.map((c) => ({
			...c,
			windows: c.windows
				.map((w) => ({
					...w,
					poolIds: selectedPools.length === 0 ? w.poolIds : w.poolIds.filter((id) => selectedPools.includes(id)),
				}))
				.filter((w) => w.poolIds.length > 0),
		}))
		.filter((c) => c.windows.length > 0);
	const relevantGaps = scheduleGaps
		.map((g) => ({
			...g,
			poolIds: selectedPools.length === 0 ? g.poolIds : g.poolIds.filter((id) => selectedPools.includes(id)),
		}))
		.filter((g) => g.poolIds.length > 0);

	// filter alerts to match selected pools (or show all if no pools selected)
	const relevantAlerts = selectedPools.length === 0
		? poolAlerts
		: poolAlerts.filter((a) => {
			return selectedPools.some((poolId) => {
				const poolMeta = pools.find((p) => p.id === poolId);
				if (!poolMeta) return false;
				
				const shortName = poolMeta.shortName;
				const titleName = poolMeta.nameTitle;
				const alertLower = a.poolName.toLowerCase();

				// exact matches
				if (a.poolName === shortName || a.poolName === titleName) {
					return true;
				}

				// check if alert contains significant words from pool name
				const commonWords = new Set(
					["pool", "swimming", "aquatic", "aquatics", "center"]);
				const shortNameLower = shortName?.toLowerCase() || "";
				const poolWords = shortNameLower.split(/[\s-]+/).filter(w => w.length > 2 && !commonWords.has(w));
				const alertWords = alertLower.split(/[\s-]+/).filter(w => w.length > 2 && !commonWords.has(w));
				const matchCount = poolWords.filter(pw => alertWords.some(aw => aw.includes(pw) || pw.includes(aw))).length;

				if (matchCount >= 2) {
					return true;
				}

				return false;
			});
		});

	if (relevantAlerts.length === 0 && relevantClosures.length === 0 && relevantGaps.length === 0) {
		return null;
	}

	const poolName = (id: string) => {
		const pool = pools.find((p) => p.id === id);
		return pool?.shortName || pool?.nameTitle || id;
	};

	return (
		// two to a row when there's room, rather than full-width boxes that are
		// mostly empty; a lone alert still spans the row
		<div className="mt-3 mb-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-2">
			{relevantClosures.map((c) => (
				<div
					key={`week-${c.startDate}-${c.endDate}-${c.reason}`}
					className="font-sans border-l-[3px] border-alert bg-alert-tint px-3 py-2.5"
				>
					<div className="font-mono text-label font-semibold tracking-[.08em] text-alert">
						<span aria-hidden className="status-dot ring-2 ring-alert ring-inset" />
						CLOSED
					</div>
					{c.windows.length === 1 ? (
						<>
							<p className="mt-1 text-body font-medium text-ink">
								{formatWhen(c, c.windows[0])}
								{c.reason ? ` for ${c.reason}` : ""}
							</p>
							<p className="mt-0.5 text-small text-ink-2">
								{c.windows[0].poolIds.map(poolName).join(", ")}
							</p>
						</>
					) : (
						// pools closing different hours for the same thing, such
						// as a training day, share a notice with a line per window
						<>
							<p className="mt-1 text-body font-medium text-ink">
								{formatWhen(c)}
								{c.reason ? ` for ${c.reason}` : ""}
							</p>
							<ul className="mt-0.5 text-small text-ink-2">
								{c.windows.map((w) => (
									<li key={`${w.startTime}-${w.endTime}`}>
										{w.poolIds.map(poolName).join(", ")}
										{" · "}
										{w.startTime && w.endTime ? `${w.startTime}–${w.endTime}` : "all day"}
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			))}
			{relevantGaps.map((g) => (
				// the grid has no sessions for these pools past the end of their
				// printed schedule, or before the start of the next one
				<div
					key={`gap-${g.kind}-${g.date}`}
					className="font-sans border-l-[3px] border-alert bg-alert-tint px-3 py-2.5"
				>
					<div className="font-mono text-label font-semibold tracking-[.08em] text-alert">
						<span aria-hidden className="status-dot ring-2 ring-alert ring-inset" />
						NO SCHEDULE
					</div>
					<p className="mt-1 text-body font-medium text-ink">
						{g.kind === "starts"
							? `New schedule starts ${formatDay(g.date)}`
							: `Schedule ${g.date < from ? "ended" : "ends"} ${formatDay(g.date)}`}
					</p>
					<p className="mt-0.5 text-small text-ink-2">
						{g.poolIds.map(poolName).join(", ")}
						{g.kind === "starts" ? " · nothing listed before then" : " · nothing listed after that until a new one is posted"}
					</p>
				</div>
			))}
			{relevantAlerts.map((alert, i) =>
				// a parsed closure renders as its date range and linked notice; a
				// plain alert still shows its text
				alert.closure ? (
					<ClosureNotice
						key={`pool-${i}`}
						closure={alert.closure}
						poolName={alert.poolName}
					/>
				) : (
					<div
						key={`pool-${i}`}
						className="font-sans border-l-[3px] border-alert bg-alert-tint px-3 py-2.5"
					>
						<div className="font-mono text-label font-semibold tracking-[.08em] text-alert">
							ALERT
						</div>
						<p className="mt-1 text-body text-ink">
							<span className="font-medium">{alert.poolName}: </span>
							{alert.documentUrl ? (
								<a
									href={alert.documentUrl}
									target="_blank"
									rel="noreferrer"
									className="link-inline"
								>
									{alert.alertText}
								</a>
							) : (
								alert.alertText
							)}
						</p>
					</div>
				)
			)}
		</div>
	);
}

/** "Mon Oct 12" */
function formatDay(date: string): string {
	return formatScheduleDate(date, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
}

/** "Mon Oct 12" / "Mon Nov 2 – Sat Nov 21" / "Thu Oct 22, 12:00p–2:00p" */
function formatWhen(c: SharedClosure, window?: ClosureWindow): string {
	let when = formatDay(c.startDate);
	if (c.endDate !== c.startDate) when += ` – ${formatDay(c.endDate)}`;
	if (window?.startTime && window.endTime) when += `, ${window.startTime}–${window.endTime}`;
	return when;
}
