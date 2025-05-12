import { Program } from "@/lib/pdf-processor"; // Assuming Program is exported and available
import { formatTime } from "@/lib/timeUtils";

// Ensure FilteredProgram is defined or imported if not using Program directly
export interface FilteredProgram extends Program {
	poolName: string;
	poolId: string;
}

interface ResultsListProps {
	groupedAndSortedResults: Record<string, FilteredProgram[]>;
	dayOrder: string[];
	hasResults: boolean;
}

export default function ResultsList({
	groupedAndSortedResults,
	dayOrder,
	hasResults
}: ResultsListProps) {
	if (!hasResults) {
		return (
			<div>
				<h2 className="text-2xl font-semibold mb-4 text-stone-700">
					No programs match your selection.
				</h2>
				<p className="text-stone-500">Try adjusting your search or clearing
					filters to see more options.</p>
			</div>
		);
	}

	return (
		<div>
			<div className="space-y-6">
				{dayOrder.map(day =>
					groupedAndSortedResults[day] &&
					groupedAndSortedResults[day].length > 0 && (
						<div key={day}>
							<h3 className="text-xl font-semibold mb-3 text-stone-600 border-b pb-1">{day}</h3>
							<div className="space-y-3">
								{groupedAndSortedResults[day].map((program, index) => (
									<div key={`${program.poolId}-${program.programName}-${program.startTime}-${index}`} className="p-3 bg-white rounded-lg shadow border border-stone-200">
										<h4 className="font-semibold md:text-lg text-stone-800">{program.programName}</h4>
										<p className="text-stone-600">{program.poolName}</p>
										<p className="text-stone-600">
											{formatTime(program.startTime)} - {formatTime(
											program.endTime)}
											{program.lanes &&
												<span className="ml-2">/ {program.lanes} lanes</span>}
										</p>
										{program.notes &&
											<p className="text-sm text-stone-500 mt-1">Note: {program.notes}</p>}
									</div>
								))}
							</div>
						</div>
					))}
			</div>
		</div>
	);
}
