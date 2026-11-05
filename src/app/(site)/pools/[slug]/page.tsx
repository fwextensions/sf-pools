import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppleMapsLink from "@/components/AppleMapsLink";
import GridLink from "@/components/grid/GridLink";
import PoolChip from "@/components/PoolChip";
import { ExternalLinkIcon } from "@/components/icons";
import PoolList from "@/components/pools/PoolList";
import PoolScheduleSection from "@/components/schedule/PoolScheduleSection";
import SessionFocus from "@/components/schedule/SessionFocus";
import { buildPoolPages, poolPageSlugs, type PoolPage } from "@/lib/pool-pages";
import { describeProgram } from "@/lib/program-display";
import { pacificToday } from "@/lib/closures";
import { createPoolCalendar } from "@/lib/pool-calendar";
import { loadAlerts, loadPools, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

type Params = { slug: string };

// every page is built ahead; a slug that isn't one of ours is a 404
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
	return poolPageSlugs().map((slug) => ({ slug }));
}

// each pool's schedule in force when the page is built: a newer PDF that
// has started takes over here as it does in the grid and Now & Soon, which
// go by the pool calendar, rather than waiting for the weekly run to promote
// it into the current schedules
async function loadPages(): Promise<PoolPage[]> {
	const [records, schedules, upcoming] = await Promise.all([loadPools(), loadSchedules(), loadUpcomingSchedules()]);
	const calendar = createPoolCalendar(schedules, upcoming);
	const today = pacificToday();
	const inForce = schedules.map((s) => calendar.scheduleOn(s.id, today) ?? s);
	return buildPoolPages(records, inForce);
}

async function loadPage(slug: string): Promise<PoolPage | null> {
	return (await loadPages()).find((p) => p.slug === slug) ?? null;
}

/** the distinct program names on the page's schedules, most sessions first */
function programNames(page: PoolPage): string[] {
	const counts = new Map<string, number>();
	for (const { schedule } of page.pools) {
		for (const program of schedule.programs) {
			const name = describeProgram(program).title;
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
	const page = await loadPage((await params).slug);
	if (!page) return {};
	const programs = programNames(page).slice(0, 4).join(", ");
	return {
		title: `${page.name} swim schedule`,
		description:
			`Weekly swim schedule for ${page.name} at ${page.address}, San Francisco` +
			(programs ? `: ${programs} and more.` : ".") +
			" Session times, closures and the official schedule PDF.",
		alternates: { canonical: `/pools/${page.slug}` },
	};
}

function mapsUrl(page: PoolPage): string {
	const query = `${page.facilityName}, ${page.address}, San Francisco, CA`;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** "(415) 831-6805" -> "+1-415-831-6805", the international form schema.org asks for */
function telephone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** schema.org's description of the place, for search engines */
function structuredData(page: PoolPage) {
	return {
		"@context": "https://schema.org",
		"@type": "PublicSwimmingPool",
		name: page.facilityName,
		alternateName: page.name,
		url: `${SITE_URL}/pools/${page.slug}`,
		sameAs: page.pageUrl || undefined,
		address: {
			"@type": "PostalAddress",
			streetAddress: page.address,
			addressLocality: "San Francisco",
			addressRegion: "CA",
			postalCode: page.postalCode,
			addressCountry: "US",
		},
		telephone: page.phone ? telephone(page.phone) : undefined,
	};
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5 border-t border-line py-2.5">
			<dt className="font-mono text-label font-semibold tracking-[.08em] text-ink-2">{label}</dt>
			<dd className="text-body text-ink">{children}</dd>
		</div>
	);
}

export default async function PoolPageView({ params }: { params: Promise<Params> }) {
	const { slug } = await params;
	const pages = await loadPages();
	const page = pages.find((p) => p.slug === slug);
	if (!page) notFound();

	const alerts = await loadAlerts();
	const poolIds = page.pools.map(({ schedule }) => schedule.id);
	// a notice the pipeline parsed into a closure already shows in the
	// schedule below, as that pool's closed notice; only the rest show here
	const notices = (alerts?.poolAlerts ?? []).filter((a) => poolIds.includes(a.poolId) && !a.closure);
	const pdfs = page.pools.filter(({ schedule }) => schedule.pdfScheduleUrl);
	const single = page.pools.length === 1;

	return (
		<main>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(page)).replace(/</g, "\\u003c") }}
			/>
			<header className="pt-6 pb-3">
				{/* the chips stay beside a name that wraps, centered on its first
				    line: their box is one line of the heading tall */}
				<div className="flex items-start gap-x-2.5">
					<span className="flex h-[1lh] flex-none items-center gap-1 text-title leading-tight">
						{page.pools.map(({ schedule, token }) => (
							<PoolChip key={schedule.id} token={token} />
						))}
					</span>
					<h1 className="text-title font-semibold leading-tight">{page.facilityName}</h1>
				</div>
			</header>

			<dl className="grid grid-cols-1 gap-x-8 min-[560px]:grid-cols-3">
				<Fact label="ADDRESS">
					<span className="flex flex-wrap items-baseline gap-x-8 min-[900px]:gap-x-4">
						<a href={mapsUrl(page)} target="_blank" rel="noreferrer" className="link-inline">
							{page.address}<ExternalLinkIcon />
						</a>
						<AppleMapsLink
							name={page.facilityName}
							address={`${page.address}, San Francisco, CA`}
							className="link-inline"
						/>
					</span>
					{page.phone ? (
						<a href={`tel:${page.phone.replace(/\D/g, "")}`} className="link-inline block w-fit">
							{page.phone}
						</a>
					) : null}
				</Fact>
				{pdfs.length || page.pageUrl ? (
					<Fact label="OFFICIAL">
						{pdfs.map(({ schedule, token }) => (
							<a
								key={schedule.id}
								href={schedule.pdfScheduleUrl!}
								target="_blank"
								rel="noreferrer"
								className="link-inline block w-fit"
							>
								{/* North Beach has a PDF per pool */}
								{single ? "Schedule PDF" : `${token?.name ?? schedule.shortName} schedule PDF`}
								<ExternalLinkIcon />
							</a>
						))}
						{page.pageUrl ? (
							<a href={page.pageUrl} target="_blank" rel="noreferrer" className="link-inline block w-fit">
								SF Rec &amp; Parks page<ExternalLinkIcon />
							</a>
						) : null}
					</Fact>
				) : null}
				<Fact label="ON THIS SITE">
					<GridLink state={{ tags: [], pools: poolIds, cell: null }} className="link-inline">
						See it in the week grid
					</GridLink>
				</Fact>
			</dl>

			{notices.length ? (
				<div className="mt-3 flex flex-col gap-2">
					{notices.map((alert, i) => (
						<div key={i} className="border-l-[3px] border-alert bg-alert-tint px-3 py-2.5">
							<div className="font-mono text-label font-semibold tracking-[.08em] text-alert">ALERT</div>
							<p className="mt-1 text-body text-ink">
								{alert.documentUrl ? (
									<a href={alert.documentUrl} target="_blank" rel="noreferrer" className="link-inline">
										{alert.alertText}
									</a>
								) : (
									alert.alertText
								)}
							</p>
						</div>
					))}
				</div>
			) : null}

			{page.pools.map(({ schedule, token }) => (
				<PoolScheduleSection
					key={schedule.id}
					pool={schedule}
					token={token}
					// North Beach's two pools say which is which
					label={single ? "Weekly schedule" : `${token?.name.match(/\((\w+)\)/)?.[1] ?? schedule.shortName} pool weekly schedule`}
				/>
			))}
			<SessionFocus />

			{/* the way on to the next pool, without going back up to the list */}
			<nav aria-labelledby="other-pools" className="mt-12 border-t border-line pt-2.5">
				<h2 id="other-pools" className="font-mono text-label font-semibold tracking-[.08em] text-ink-2">
					OTHER POOLS
				</h2>
				<PoolList pages={pages.filter((p) => p !== page)} className="mt-1" />
			</nav>
		</main>
	);
}
