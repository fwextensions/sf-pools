import type { SessionSpan } from "@/lib/session-span";

/**
 * A session's length against the others in its list, light grey, with the
 * stretch that matters now in a darker grey. It sits right on the row's rule
 * at the bottom right, under the times, as wide as the longest time range in
 * the mono font the times are set in. The row needs `relative`.
 */
export default function SessionBar({ span, className = "text-small" }: { span: SessionSpan; className?: string }) {
	return (
		<span aria-hidden="true" className={`pointer-events-none absolute right-0 bottom-0 h-[2px] w-[13ch] font-mono ${className}`}>
			<span className="absolute inset-y-0 bg-line-strong" style={{ left: `${span.left}%`, width: `${span.width}%` }} />
			{span.markWidth ? (
				<span className="absolute inset-y-0 bg-ink-2" style={{ left: `${span.markLeft}%`, width: `${span.markWidth}%` }} />
			) : null}
		</span>
	);
}
