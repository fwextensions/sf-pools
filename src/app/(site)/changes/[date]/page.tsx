import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChangelogView from "@/components/ChangelogView";
import { formatShortDate, getChangelog, listChangelogs } from "@/lib/changelog-data";

// every update is known at build time, and the weekly commit that adds one
// triggers a new build, so an unknown date is a 404 rather than a render
export const dynamicParams = false;

export async function generateStaticParams() {
	return (await listChangelogs()).map(({ date }) => ({ date }));
}

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { date } = await params;
	return {
		title: `Schedule changes, ${formatShortDate(date, { year: "numeric" })} — SF Pools`,
		description: "What changed in this update of the San Francisco public pool schedules.",
	};
}

export default async function ChangesForDatePage({ params }: Props) {
	const { date } = await params;
	const [detail, updates] = await Promise.all([getChangelog(date), listChangelogs()]);
	if (!detail) notFound();
	return <ChangelogView detail={detail} updates={updates} />;
}
