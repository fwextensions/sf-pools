import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { getPoolToken, type PoolToken } from "@/lib/pool-tokens";

export const metadata: Metadata = {
	title: "About — SF Pools",
	description: "What SF Pools is, where its schedules come from, and how far to trust them.",
};

const GITHUB_URL = "https://github.com/fwextensions/sf-pools";
const REC_PARK_URL = "https://sfrecpark.org";

type PoolRecord = {
	id: string;
	nameTitle: string;
	address: string;
	pageUrl: string;
};

type Facility = {
	name: string;
	address: string;
	pageUrl: string;
	tokens: PoolToken[];
};

// North Beach's warm and cool pools are two schedules at one address with one
// page, so the list is of facilities: one row each, with every pool's chip
async function readFacilities(): Promise<Facility[]> {
	try {
		const file = path.join(process.cwd(), "data", "pools.json");
		const pools = JSON.parse(await fs.readFile(file, "utf-8")) as PoolRecord[];
		const byPage = new Map<string, Facility>();
		for (const pool of pools) {
			const token = getPoolToken(pool.id);
			const existing = byPage.get(pool.pageUrl);
			if (existing) {
				if (token) existing.tokens.push(token);
				continue;
			}
			byPage.set(pool.pageUrl, {
				name: pool.nameTitle.replace(/\s*\(.*\)$/, ""),
				address: pool.address.replace(/, San Francisco$/, ""),
				pageUrl: pool.pageUrl,
				tokens: token ? [token] : [],
			});
		}
		return [...byPage.values()];
	} catch {
		return [];
	}
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3 border-t-2 border-[#0e2733] pt-4">
			<h2 className="plex-mono text-[12px] font-semibold tracking-[.08em]">{title}</h2>
			<div className="flex flex-col gap-3 text-[15px] leading-relaxed text-[#243c48]">{children}</div>
		</section>
	);
}

const inlineLink = "text-[#0e2733] underline underline-offset-2 hover:text-[#2596be]";

export default async function AboutPage() {
	const facilities = await readFacilities();

	return (
		<main>
			<header className="pt-6">
				<h1 className="text-[26px] font-semibold leading-tight">About SF Pools</h1>
				<p className="mt-1.5 max-w-[62ch] text-[14px] text-[#5a707c]">
					Every public pool schedule in San Francisco, in one place.
				</p>
			</header>

			<div className="mt-7 flex max-w-[68ch] flex-col gap-10">
				<Section title="WHAT THIS IS">
					<p>
						San Francisco Rec &amp; Park runs nine public pools, and each one posts its schedule as a
						separate PDF. Finding a lap swim that fits your morning means opening several of them and
						comparing by hand. This site does that comparison for you.
					</p>
					<p>
						The <Link href="/" className={inlineLink}>week grid</Link> shows which pools have a program
						at each hour of the week,{" "}
						<Link href="/now" className={inlineLink}>now &amp; soon</Link>
						{" "}shows what&rsquo;s open at the moment, and the{" "}
						<Link href="/schedules" className={inlineLink}>full schedules</Link> list every session at
						every pool.
					</p>
				</Section>

				<Section title="WHERE THE SCHEDULES COME FROM">
					<p>
						Every Friday, a script checks each pool&rsquo;s page on the Rec &amp; Park site, downloads any
						schedule PDF that has changed, and has an AI model read it into structured data. It also picks
						up the closure and alert notices posted on those pages.
					</p>
					<p>
						Each update is checked for signs of a bad read before it goes live. If one pool&rsquo;s
						schedule looks wrong, that pool keeps last week&rsquo;s data while the others update. You can
						see what changed in each update on the{" "}
						<Link href="/changes" className={inlineLink}>schedule changes</Link> page.
					</p>
				</Section>

				<Section title="CHECK BEFORE YOU GO">
					<p>
						This is an independent project, not a city site. Reading PDFs automatically can get details
						wrong, and pools change hours, close for maintenance, or cancel sessions at short notice. Before
						you head out, confirm on the pool&rsquo;s official page or with{" "}
						<a href={REC_PARK_URL} target="_blank" rel="noreferrer" className={inlineLink}>
							SF Rec &amp; Park
						</a>
						.
					</p>
				</Section>

				{facilities.length > 0 && (
					<Section title="THE POOLS">
						<ul className="flex flex-col">
							{facilities.map((facility) => (
								<li
									key={facility.pageUrl}
									className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#e2e8ec] py-2.5"
								>
									<span className="flex gap-1 self-center">
										{facility.tokens.map((token) => (
											<span
												key={token.id}
												className="plex-mono px-[5px] py-[3px] text-[10px] font-semibold text-white"
												style={{ background: token.color }}
											>
												{token.code}
											</span>
										))}
									</span>
									<span className="font-medium text-[#0e2733]">{facility.name}</span>
									<span className="text-[14px] text-[#5a707c]">{facility.address}</span>
									<a
										href={facility.pageUrl}
										target="_blank"
										rel="noreferrer"
										className="plex-mono ml-auto text-[11px] font-medium text-[#5a707c] underline underline-offset-2"
									>
										POOL PAGE ↗
									</a>
								</li>
							))}
						</ul>
					</Section>
				)}

				<Section title="THE CODE">
					<p>
						The site and the pipeline behind it are open source on{" "}
						<a href={GITHUB_URL} target="_blank" rel="noreferrer" className={inlineLink}>
							GitHub
						</a>
						. If a schedule looks wrong or something doesn&rsquo;t work, opening an issue there is the best
						way to report it.
					</p>
				</Section>
			</div>
		</main>
	);
}
