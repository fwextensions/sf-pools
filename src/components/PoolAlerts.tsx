import { AlertsData } from "../../scripts/scrape-alerts";
import { PoolSchedule } from "@/lib/pdf-processor";

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
			{relevantAlerts.map((
				alert,
				i) => (
				<div
					key={`pool-${i}`}
					className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
				>
					<span className="mr-2 font-medium">🚨</span>
					<span className="font-medium">{alert.poolName}: </span>
					{alert.alertText}
				</div>
			))}
		</div>
	);
}
