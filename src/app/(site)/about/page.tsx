import type { Metadata } from "next";
import BaseLink from "next/link";
import Markdown, { type Components } from "react-markdown";
import PoolChip from "@/components/PoolChip";
import { ExternalLinkIcon } from "@/components/icons";
import { aboutFacilities, loadAboutSource, parseAbout, type Facility } from "@/lib/about-content";
import { markdownPath } from "@/lib/page-markdown";
import { poolPageHref } from "@/lib/pool-pages";
import { loadPools } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

// the words come from src/content/about.md, which /about.md also serves
export const metadata: Metadata = {
	title: "About",
	description: "What SF Pools is, where its schedules come from, and how far to trust them.",
	alternates: { types: { "text/markdown": markdownPath("/about") } },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3 border-t-2 border-ink pt-4">
			<h2 className="font-mono text-small font-semibold tracking-[.08em]">{title}</h2>
			<div className="flex flex-col gap-3 text-body leading-relaxed text-ink-2">{children}</div>
		</section>
	);
}

const inlineLink = "link-inline";

function Link({ href, children }: { href: string, children: React.ReactNode })
{
	return (
		<BaseLink href={href} className={inlineLink}>
			{children}
		</BaseLink>
	)
}

function ExternalLink({ href, children }: { href: string, children: React.ReactNode })
{
	return (
		<a href={href} className={inlineLink} target="_blank" rel="noreferrer">
			{children}
		</a>
	)
}

// the site's own pages go through the router; its files and API, like
// /llms.txt, are plain links, and anything elsewhere opens a new tab
const components: Components = {
	a({ href = "", children }) {
		if (/^https?:/.test(href)) return <ExternalLink href={href}>{children}</ExternalLink>;
		if (href.startsWith("/api/") || /\.\w+$/.test(href)) return <a href={href} className={inlineLink}>{children}</a>;
		return <Link href={href}>{children}</Link>;
	},
	code({ children }) {
		return <code className="font-mono text-small">{children}</code>;
	},
};

function PoolList({ facilities }: { facilities: Facility[] }) {
	return (
		<ul className="flex flex-col">
			{facilities.map((facility) => (
				<li
					key={facility.pageUrl}
					className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-2.5"
				>
					<span className="flex gap-1 self-center">
						{facility.tokens.map((token) => (
							<BaseLink
								key={token.id}
								href={poolPageHref(token.id)}
								className="flex"
							>
								<PoolChip token={token} />
							</BaseLink>
						))}
					</span>
					<BaseLink
						href={poolPageHref(facility.poolId)}
						className={`font-medium ${inlineLink}`}
					>
						{facility.name}
					</BaseLink>
					<span className="text-body text-ink-2">{facility.address}</span>
					<a
						href={facility.pageUrl}
						target="_blank"
						rel="noreferrer"
						className="link-utility ml-auto"
					>
						Pool page<ExternalLinkIcon />
					</a>
				</li>
			))}
		</ul>
	);
}

export default async function AboutPage() {
	const [source, records] = await Promise.all([loadAboutSource(), loadPools()]);
	const about = parseAbout(source, SITE_URL);
	const facilities = aboutFacilities(records);

	return (
		<main>
			<header className="pt-6">
				<h1 className="text-title font-semibold leading-tight">{about.title}</h1>
				<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">{about.lede}</p>
			</header>

			<div className="mt-7 flex max-w-[68ch] flex-col gap-10">
				{about.sections.map((section) =>
					section.pools ? (
						facilities.length > 0 && (
							<Section key={section.title} title={section.title.toUpperCase()}>
								<PoolList facilities={facilities} />
							</Section>
						)
					) : (
						<Section key={section.title} title={section.title.toUpperCase()}>
							<Markdown components={components}>{section.body}</Markdown>
						</Section>
					)
				)}
			</div>
		</main>
	);
}
