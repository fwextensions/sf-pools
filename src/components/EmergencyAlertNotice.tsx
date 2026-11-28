import type { EmergencyAlert } from "@/lib/emergency-alerts";
import { ExternalLinkIcon } from "@/components/icons";

/**
 * A Rec & Park emergency alert that reads as affecting the pools, such as a
 * storm or smoke closure. The Alert Center's alerts run to a few paragraphs,
 * so only the first shows, cut to three lines, with a link to the rest.
 */
export default function EmergencyAlertNotice({ alert }: { alert: EmergencyAlert }) {
	const lead = alert.text.split("\n\n")[0];

	return (
		<div className="font-sans border-l-[3px] border-alert bg-alert-tint px-3 py-2.5" data-alert={alert.id}>
			<div className="font-mono text-label font-semibold tracking-[.08em] text-alert">
				<span aria-hidden className="status-dot ring-2 ring-alert ring-inset" />
				EMERGENCY ALERT
			</div>
			<p className="mt-1 text-body font-medium text-ink">{alert.title}</p>
			{lead ? <p className="mt-0.5 line-clamp-3 text-small text-ink-2">{lead}</p> : null}
			<a href={alert.url} target="_blank" rel="noreferrer" className="link-utility mt-1.5 inline-block">
				Read the alert<ExternalLinkIcon />
			</a>
		</div>
	);
}
