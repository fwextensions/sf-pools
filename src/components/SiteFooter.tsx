import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { formatShortDate, listChangelogs } from "@/lib/changelog-data";
import type { AlertsData } from "../../scripts/scrape-alerts";

const REC_PARK_URL = "https://sfrecpark.org";
const GITHUB_URL = "https://github.com/fwextensions/sf-pools";

// every weekly run rewrites the alerts file, so its timestamp is the last time
// the schedules were checked, whether or not anything changed
async function readLastChecked(): Promise<string | null> {
	try {
		const file = path.join(process.cwd(), "public", "data", "alerts.json");
		const alerts = JSON.parse(await fs.readFile(file, "utf-8")) as AlertsData;
		return alerts.lastUpdated ?? null;
	} catch {
		return null;
	}
}

// on a phone the two groups run together as one list of full-width rows,
// so the group labels drop out; from 900px up they're two labelled columns
const linkClass =
	"flex h-12 items-center border-b border-[#e2e8ec] text-[14px] font-medium text-[#0e2733] hover:text-[#2596be] " +
	"min-[900px]:h-auto min-[900px]:border-0";
const groupLabelClass =
	"plex-mono hidden text-[11px] font-medium tracking-[.08em] text-[#5a707c] min-[900px]:mb-1 min-[900px]:block";

export default async function SiteFooter() {
	const [lastChecked, changelogs] = await Promise.all([readLastChecked(), listChangelogs()]);
	const lastChange = changelogs[0]?.date ?? null;

	return (
		<footer className="mt-16 border-t-2 border-[#0e2733] pt-6 min-[900px]:pt-7">
			<div className="flex flex-col gap-5 min-[900px]:grid min-[900px]:grid-cols-[2fr_1fr_1fr] min-[900px]:gap-12">
				<div className="flex max-w-[460px] flex-col gap-2.5">
					<div className="plex-mono text-[12px] font-semibold tracking-[.08em]">SF POOLS</div>
					<p className="text-[14px] leading-relaxed text-[#3d5663]">
						Every public pool schedule in San Francisco in one place, read from the PDFs that SF Rec
						&amp; Park publishes. This is an independent project, not a city site. Check the official
						page before you go.
					</p>
				</div>
				<div className="flex flex-col border-t border-[#e2e8ec] min-[900px]:contents">
					<nav aria-label="This site" className="flex flex-col min-[900px]:gap-3">
						<div className={groupLabelClass}>THIS SITE</div>
						<Link href="/about" className={linkClass}>
							About
						</Link>
						<Link href="/changes" className={linkClass}>
							Schedule changes
						</Link>
					</nav>
					<nav aria-label="Elsewhere" className="flex flex-col min-[900px]:gap-3">
						<div className={groupLabelClass}>ELSEWHERE</div>
						<a href={REC_PARK_URL} target="_blank" rel="noreferrer" className={linkClass}>
							SF Rec &amp; Park ↗
						</a>
						<a href={GITHUB_URL} target="_blank" rel="noreferrer" className={linkClass}>
							Code on GitHub ↗
						</a>
					</nav>
				</div>
			</div>
			<div className="plex-mono mt-5 flex flex-col gap-1 text-[11px] tracking-[.06em] text-[#5a707c] min-[900px]:mt-9 min-[900px]:flex-row min-[900px]:items-baseline min-[900px]:justify-between min-[900px]:border-t min-[900px]:border-[#e2e8ec] min-[900px]:pt-3.5">
				<span>
					<span className="block min-[900px]:inline">CHECKED EVERY FRIDAY</span>
					{lastChecked && (
						<>
							<span className="hidden min-[900px]:inline"> · </span>
							LAST CHECKED {formatShortDate(lastChecked).toUpperCase()}
						</>
					)}
					{lastChange && <> · LAST CHANGE {formatShortDate(lastChange).toUpperCase()}</>}
				</span>
				{lastChange && (
					<Link
						href="/changes"
						className="hidden text-[#0e2733] underline underline-offset-[3px] min-[900px]:inline"
					>
						WHAT CHANGED →
					</Link>
				)}
			</div>
		</footer>
	);
}
