import fs from "fs/promises";
import path from "path";
import type { Metadata } from "next";

// Assuming PoolSchedule and Program types are exported from pdf-processor
// Adjust the import path based on your project structure if lib is elsewhere
import type { PoolSchedule } from "@/lib/pdf-processor";

export const metadata: Metadata = {
	title: "SF Pool Schedules",
	description: "Swimming pool schedules for San Francisco public pools",
};

async function getSchedulesData(): Promise<{
	schedules: PoolSchedule[];
	error?: string
}>
{
	const dataFilePath = path.join(process.cwd(), "public", "data",
		"all_schedules.json");
	try {
		const jsonData = await fs.readFile(dataFilePath, "utf-8");
		const schedules: PoolSchedule[] = JSON.parse(jsonData);
		return { schedules };
	} catch (error) {
		console.error("Error reading schedule data for schedules page:", error);
		return {
			schedules: [],
			error: "Failed to load schedule data. Please try again later.",
		};
	}
}

export default async function SchedulesPage() {
	const { schedules, error } = await getSchedulesData();

	if (error) {
		return <div className="container mx-auto p-4">
			<p className="text-red-500">{error}</p></div>;
	}

	if (!schedules || schedules.length === 0) {
		return <div className="container mx-auto p-4"><p>No pool schedules available
			at the moment.</p></div>;
	}

	return (
		<div className="container mx-auto p-4">
			<h1 className="text-3xl font-bold mb-6 text-center text-blue-600">San
				Francisco Public Pool Schedules</h1>

			{schedules.map((
				pool,
				index) => (
				<div key={index} className="bg-white shadow-lg rounded-lg p-6 mb-8">
					<h2 className="text-2xl font-semibold mb-2 text-blue-500">{pool.poolName}</h2>
					{pool.address && <p className="text-gray-700 mb-1">
						<strong>Address:</strong> {pool.address}</p>}
					{pool.scheduleLastUpdated &&
						<p className="text-sm text-gray-500 mb-1"><strong>Last
							Updated:</strong> {pool.scheduleLastUpdated}</p>}
					{pool.sfRecParkUrl &&
						<p className="text-sm text-gray-500 mb-4">
							<strong>More Info:</strong>
							<a
								href={pool.sfRecParkUrl.startsWith("http") ? pool.sfRecParkUrl :
									`http://${pool.sfRecParkUrl}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-500 hover:underline"
							>
								{pool.sfRecParkUrl}
							</a>
						</p>}

					<h3 className="text-xl font-medium mt-4 mb-3 text-gray-800">Programs:</h3>
					{pool.programs.length > 0 ? (
						<ul className="space-y-3">
							{pool.programs.map((
								program,
								progIndex) => (
								<li key={progIndex} className="p-4 bg-gray-50 rounded-md shadow-sm">
									<p className="font-semibold text-gray-700">{program.programName}</p>
									<p className="text-sm text-gray-600">
										<strong>Day:</strong> {program.dayOfWeek}</p>
									<p className="text-sm text-gray-600">
										<strong>Time:</strong> {program.startTime} - {program.endTime}
									</p>
									{program.notes && <p className="text-xs text-gray-500 mt-1">
										<em>Note: {program.notes}</em></p>}
								</li>
							))}
						</ul>
					) : (
						<p className="text-gray-600">No specific programs listed for this
							schedule.</p>
					)}
				</div>
			))}
		</div>
	);
}
