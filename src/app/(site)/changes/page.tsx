import type { Metadata } from "next";
import ChangelogView from "@/components/ChangelogView";
import { getChangelog, listChangelogs } from "@/lib/changelog-data";

export const metadata: Metadata = {
	title: "Schedule changes — SF Pools",
	description: "What changed in each weekly update of the San Francisco public pool schedules.",
};

// the latest update; each one also has its own page at /changes/<date>
export default async function ChangesPage() {
	const [detail, updates] = await Promise.all([getChangelog(), listChangelogs()]);
	return <ChangelogView detail={detail} updates={updates} />;
}
