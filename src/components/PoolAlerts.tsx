import { AlertsData } from "../../scripts/scrape-alerts";
import { PoolSchedule } from "@/lib/pdf-processor";
import ClosureNotice from "@/components/ClosureNotice";

type Props = {
	alerts: AlertsData;
	pools: PoolSchedule[];
	selectedPools: string[];
}

export default function PoolAlerts({ alerts, pools, selectedPools }: Props) {
	// filter alerts to match selected pools (or show all if no pools selected)
	const relevantAlerts = selectedPools.length === 0
		? alerts.poolAlerts
		: alerts.poolAlerts.filter((a) => {
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

	if (relevantAlerts.length === 0) {
		return null;
	}

	return (
		<div className="mt-3 space-y-2">
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
						className="plex-sans border-l-[3px] border-[#c0523c] bg-[#fbf0ee] px-3 py-2.5"
					>
						<div className="plex-mono text-label font-semibold tracking-[.14em] text-[#a4432f]">
							ALERT
						</div>
						<p className="mt-1 text-body text-[#0e2733]">
							<span className="font-medium">{alert.poolName}: </span>
							{alert.documentUrl ? (
								<a
									href={alert.documentUrl}
									target="_blank"
									rel="noreferrer"
									className="underline underline-offset-2"
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
