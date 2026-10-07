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
				className="flex h-full items-baseline gap-1.5 overflow-hidden border-l-[3px] bg-tint px-1.5 py-[3px]"
				style={{ borderColor: color }}
			>
				<span className="font-mono text-label font-medium text-ink-2">{program.startTime}</span>
				<span className="truncate text-small font-medium leading-snug text-ink">
					<ProgramName name={title} />
				</span>
			</div>
		);
	}
	return (
		<div className="h-full overflow-hidden border-l-[3px] bg-tint px-2 py-1.5" style={{ borderColor: color }}>
			<div className="font-mono text-label font-medium text-ink-2">
				{program.startTime}–{program.endTime}
			</div>
			{/* the lanes and areas ride in the space beside the title rather than
			    under it: a program name rarely fills its column, and a stacked row
			    cost every session a line of height it did not need. They're plain
			    meta text, joined with a dot, not boxed */}
			<div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
				<div className="min-w-0 text-small font-medium leading-snug text-ink">
					<ProgramName name={title} />
				</div>
				{badges.length ? (
					<div className="meta ml-auto shrink-0 text-right">{badges.join(" · ")}</div>
				) : null}
			</div>
			{notes.map((note) => (
				<div key={note} className="mt-1 text-label leading-snug text-ink-2">
					{note}
				</div>
			))}
		</div>
	);
}
