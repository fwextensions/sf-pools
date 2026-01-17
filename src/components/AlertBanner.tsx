import type { PoolAlert, AlertsData } from "../../scripts/scrape-alerts";

type Props = {
	alerts: AlertsData | null;
	poolName?: string; // if provided, only show alerts for this pool
};

export function AlertBanner({ alerts, poolName }: Props) {
	if (!alerts) return null;

	// filter alerts based on poolName if provided
	const poolAlerts = poolName
		? alerts.poolAlerts.filter((a) => a.poolName === poolName)
		: alerts.poolAlerts;

	const siteWideAlerts = poolName ? [] : alerts.siteWideAlerts;

	if (siteWideAlerts.length === 0 && poolAlerts.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			{siteWideAlerts.map((alert, i) => (
				<div
					key={`site-${i}`}
					className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
				>
					<span className="mr-2 font-medium">📢</span>
					{alert}
				</div>
			))}
			{poolAlerts.map((alert, i) => (
				<div
					key={`pool-${i}`}
					className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
				>
					<span className="mr-2 font-medium">🚨</span>
					{!poolName && <span className="font-medium">{alert.poolName}: </span>}
					{alert.alertText}
				</div>
			))}
		</div>
	);
}

export function AlertCount({ alerts }: { alerts: AlertsData | null }) {
	if (!alerts) return null;

	const total = alerts.siteWideAlerts.length + alerts.poolAlerts.length;
	if (total === 0) return null;

	return (
		<span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
			{total} alert{total > 1 ? "s" : ""}
		</span>
	);
}
