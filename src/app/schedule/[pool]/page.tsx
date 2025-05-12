import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PoolSchedule, Program } from "@/lib/pdf-processor";
import { formatTime } from "@/lib/timeUtils";

interface PoolPageProps {
  params: Promise<{ pool: string }>;
}

interface PoolMetadata {
	shortName: string;
	schedulePageName: string;
}

interface AllPoolsMetadata {
	[fullPoolName: string]: PoolMetadata;
}

// Helper function to get day order starting from today
const getOrderedDays = () => {
	const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
		"Friday", "Saturday"];
	const todayIndex = new Date().getDay();
	return [...days.slice(todayIndex), ...days.slice(0, todayIndex)];
};

function formatDate(
	timeStr: string | null | undefined)
{
	if (!timeStr) {
		return "";
	}

	const date = new Date(timeStr);

	return date.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric"
	});
}

export async function generateStaticParams()
{
	const metadataFilePath = path.join(process.cwd(), "public", "data",
		"pool_metadata.json");
	try {
		const metadataFileContent = await fs.readFile(metadataFilePath, "utf-8");
		const allMetadata: AllPoolsMetadata = JSON.parse(metadataFileContent);
		return Object.values(allMetadata).map(
			meta => ({ pool: meta.schedulePageName }));
	} catch (error) {
		console.error("Failed to read pool metadata for static params:", error);
		return [];
	}
}

export default async function PoolSchedulePage({ params: paramsPromise }: PoolPageProps) {
  const { pool: schedulePageName } = await paramsPromise;

	const metadataFilePath = path.join(process.cwd(), "public", "data",
		"pool_metadata.json");
	const schedulesFilePath = path.join(process.cwd(), "public", "data",
		"all_schedules.json");

	let fullPoolName: string | undefined;
	let poolSchedule: PoolSchedule | undefined;

	try {
		const metadataFileContent = await fs.readFile(metadataFilePath, "utf-8");
		const allMetadata: AllPoolsMetadata = JSON.parse(metadataFileContent);
		fullPoolName = Object.keys(allMetadata).find(
			name => allMetadata[name].schedulePageName === schedulePageName);

		if (!fullPoolName) {
			notFound();
		}

		const schedulesFileContent = await fs.readFile(schedulesFilePath, "utf-8");
		const allSchedules: PoolSchedule[] = JSON.parse(schedulesFileContent);
		poolSchedule =
			allSchedules.find(schedule => schedule.poolName === fullPoolName);

		if (!poolSchedule) {
			notFound();
		}
	} catch (error) {
		console.error(`Failed to load data for pool ${schedulePageName}:`, error);
		// Potentially show a generic error page instead of notFound for file system errors
		notFound();
	}

	const dayOrder = getOrderedDays();

	// Group and sort programs for the specific pool
	const groupedPrograms: Record<string, Program[]> = {};
	poolSchedule.programs.forEach(program => {
		if (!groupedPrograms[program.dayOfWeek]) {
			groupedPrograms[program.dayOfWeek] = [];
		}
		groupedPrograms[program.dayOfWeek].push(program);
	});

	dayOrder.forEach(day => {
		if (groupedPrograms[day]) {
			groupedPrograms[day].sort((
				a,
				b) => (a.startTime || "").localeCompare(b.startTime || ""));
		}
	});

	return (
		<div className="container mx-auto p-4 font-[family-name:var(--font-geist-sans)]">
			<header className="mb-8">
				<div className="mb-4">
					<Link href="/" className="text-blue-600 hover:text-blue-800">&larr; Back
						to All Pools</Link>
				</div>
				<h1 className="text-4xl font-bold text-center text-stone-800">
					{poolSchedule.poolName}
				</h1>
				<h2 className="text-2xl font-semibold text-center mt-4 text-stone-700">
					{poolSchedule.scheduleSeason}
				</h2>
				<p className="text-center text-sm text-stone-500 mb-3">
					{formatDate(poolSchedule.scheduleStartDate)} to {formatDate(
					poolSchedule.scheduleEndDate)}
				</p>
				{poolSchedule.address &&
					<p className="text-center text-stone-600">{poolSchedule.address}</p>}
			</header>

			<div className="space-y-6">
				{dayOrder.map(day => (
					groupedPrograms[day] && groupedPrograms[day].length > 0 && (
						<div key={day}>
							<h3 className="text-2xl font-semibold mb-3 text-stone-700 border-b pb-1">{day}</h3>
							<div className="space-y-3">
								{groupedPrograms[day].map((
									program,
									index) => (
									<div key={`${program.programName}-${program.startTime}-${index}`} className="p-3 bg-white rounded-lg shadow border border-stone-200">
										<h4 className="font-semibold text-stone-800">{program.programName}</h4>
										<p className="text-sm text-stone-600">
											{formatTime(program.startTime)} - {formatTime(
											program.endTime)}
											{program.lanes &&
												<span className="ml-2 text-sm text-stone-600">/ {program.lanes} lanes</span>}
										</p>
										{program.notes &&
											<p className="text-xs text-stone-500 mt-1">Note: {program.notes}</p>}
									</div>
								))}
							</div>
						</div>
					)
				))}
			</div>
		</div>
	);
}
