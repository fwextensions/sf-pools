import type { ProgramEntry } from "@/lib/pdf-processor";
import { describeProgram } from "@/lib/program-display";
import ProgramName from "@/components/ProgramName";

/**
 * The block repeats its start time even in the time-aligned grid, where the row
 * gutter already names it: the eye lands in the middle of a grid this size and
 * reads outward, so a block that only carried its end time would send you back
 * to the axis to find out when it began.
 *
 * `compact` drops the badges/notes and puts the time on the same line as the
 * name: a block sized to a 20-minute session has no room for a four-line
 * card, and a truncated name still beats a badge row spilling out of its box.
 * Truncation/overflow here is what TimelineBlock's clip check looks for —
 * the `.truncate` class name and the natural content height are load-bearing,
 * not just styling.
 */
export default function SessionBlock({
	program,
	color,
	compact = false,
}: {
	program: ProgramEntry;
	color: string;
	compact?: boolean;
}) {
	const { title, badges, notes } = describeProgram(program);
	if (compact) {
		return (
			<div
				className="flex h-full items-baseline gap-1.5 overflow-hidden border-l-[3px] bg-[#f7fafb] px-1.5 py-[3px]"
				style={{ borderColor: color }}
			>
				<span className="plex-mono text-[10px] font-medium text-[#5a707c]">{program.startTime}</span>
				<span className="truncate text-[12px] font-medium leading-snug text-[#0e2733]">
					<ProgramName name={title} />
				</span>
			</div>
		);
	}
	return (
		<div className="h-full overflow-hidden border-l-[3px] bg-[#f7fafb] px-2 py-1.5" style={{ borderColor: color }}>
			<div className="plex-mono text-[11px] font-medium text-[#5a707c]">
				{program.startTime}–{program.endTime}
			</div>
			{/* the badges ride in the space beside the title rather than under it:
			    a program name rarely fills its column, and a stacked badge row cost
			    every session a line of height it did not need */}
			<div className="mt-0.5 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
				<div className="min-w-0 text-[13px] font-medium leading-snug text-[#0e2733]">
					<ProgramName name={title} />
				</div>
				{badges.length ? (
					<div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
						{badges.map((badge) => (
							<span
								key={badge}
								className="border border-[#c4d2d9] bg-white px-1 py-px plex-mono text-[10px] font-medium text-[#5a707c]"
							>
								{badge}
							</span>
						))}
					</div>
				) : null}
			</div>
			{notes.map((note) => (
				<div key={note} className="mt-1 text-[11px] leading-snug text-[#8a9aa4]">
					{note}
				</div>
			))}
		</div>
	);
}
