import { AlertsData } from "../../scripts/scrape-alerts";
import { PoolSchedule } from "@/lib/pdf-processor";
import ClosureNotice from "@/components/ClosureNotice";
import type { SharedClosure } from "@/lib/sessions";
import { formatScheduleDate } from "@/lib/utils";

type Props = {
	alerts?: AlertsData | null;
	pools: PoolSchedule[];
	selectedPools: string[];
	/** closures from the PDFs' notes that fall in the week the grid shows */
	weekClosures?: SharedClosure[];
}

export default function PoolAlerts({ alerts, pools, selectedPools, weekClosures = [] }: Props) {
	const poolAlerts = alerts?.poolAlerts ?? [];
	// a closure shows when any pool it names is in the filter
	const relevantClosures = weekClosures
		.map((c) => ({
			...c,
			poolIds: selectedPools.length === 0 ? c.poolIds : c.poolIds.filter((id) => selectedPools.includes(id)),
		}))
		.filter((c) => c.poolIds.length > 0);

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

	if (relevantAlerts.length === 0 && relevantClosures.length === 0) {
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
					key={`week-${c.startDate}-${c.endDate}-${c.startTime}`}
					className="font-sans border-l-[3px] border-alert bg-alert-tint px-3 py-2.5"
				>
					<div className="font-mono text-label font-semibold tracking-[.08em] text-alert">
						<span aria-hidden className="status-dot ring-2 ring-alert ring-inset" />
						CLOSED
					</div>
					<p className="mt-1 text-body font-medium text-ink">
						{formatWhen(c)}
						{c.reason ? ` for ${c.reason}` : ""}
					</p>
					<p className="mt-0.5 text-small text-ink-2">
						{c.poolIds.map(poolName).join(", ")}
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

/** "Mon Oct 12" / "Mon Nov 2 – Sat Nov 21" / "Thu Oct 22, 12:00p–2:00p" */
function formatWhen(c: SharedClosure): string {
	const fmt = (d: string) => formatScheduleDate(d, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
	let when = fmt(c.startDate);
	if (c.endDate !== c.startDate) when += ` – ${fmt(c.endDate)}`;
	if (c.startTime && c.endTime) when += `, ${c.startTime}–${c.endTime}`;
	return when;
}
