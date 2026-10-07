"use client";

import { POOL_TOKENS } from "@/lib/pool-tokens";
import { tagLabel } from "@/lib/program-taxonomy";
import { Chevron } from "@/components/icons";
import type { FilterView, GridModel } from "@/lib/grid/grid-model";

// The program and pool pickers, shared by the desktop sidebar and the mobile
// panels, and the buttons that clear them.

export function CategoryRows({
	model,
	filters,
	compact,
	expanded,
	onToggleExpanded,
}: {
	model: GridModel;
	filters: FilterView;
	compact: boolean;
	expanded: Record<string, boolean>;
	onToggleExpanded: (id: string) => void;
}) {
	const tagSet = new Set(filters.tags);
	return <>{filters.groups.map((cat) => (
		<div key={cat.id} className="border-b border-line">
			<div className={`flex items-center gap-2.5 ${compact ? "px-4 py-2" : "px-4 py-2.5"}`}>
				<button
					type="button"
					aria-label={`Toggle every ${cat.label} tag`}
					aria-pressed={cat.allSelected}
					onClick={() => model.toggleGroup(cat.id)}
					// drawn like the tag checkboxes under it: a filled square when
					// every tag is on, a bar when some are
					className={`picker-checkbox flex items-center justify-center ${cat.allSelected ? "picker-checkbox-on" : ""}`}
				>
					{cat.someSelected && !cat.allSelected ? (
						<span aria-hidden className="block h-[1.5px] w-[8px] bg-ink" />
					) : null}
				</button>
				<button
					type="button"
					onClick={() => model.toggleGroup(cat.id)}
					className="flex-1 cursor-pointer text-left text-body font-semibold text-ink"
				>
					{cat.label}{" "}
					<span className="font-mono text-small font-medium text-ink-2">
						({cat.tags.length})
					</span>
				</button>
				<button
					type="button"
					aria-label={`${expanded[cat.id] ? "Collapse" : "Expand"} ${cat.label}`}
					onClick={() => onToggleExpanded(cat.id)}
					className="cursor-pointer px-2 py-1 text-ink-2"
				>
					<Chevron open={expanded[cat.id]} />
				</button>
			</div>
			{expanded[cat.id] ? (
				<div className="flex flex-col gap-0.5 pb-2.5 pl-11 pr-4">
					{cat.tags.map((name) => (
						<label
							key={name}
							className="flex cursor-pointer items-center gap-2 py-1.5"
						>
							<input
								type="checkbox"
								checked={tagSet.has(name)}
								onChange={() => model.toggleTag(name)}
								className="picker-checkbox"
							/>
							<span className="flex-1 text-body text-ink-2">{tagLabel(name)}</span>
							<span className="font-mono text-small font-medium text-ink-2">
								{filters.tagCounts.get(name)}
							</span>
						</label>
					))}
				</div>
			) : null}
		</div>
	))}</>;
}

export function PoolRows({ model, filters }: { model: GridModel; filters: FilterView }) {
	const { poolSet } = filters.filter;
	const selectedPools = filters.pools;
	return <>{POOL_TOKENS.map((token) => {
		const active = !poolSet || poolSet.has(token.id);
		return (
			<label
				key={token.id}
				className="flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-2"
				style={{ opacity: active ? 1 : 0.45 }}
			>
				<input
					type="checkbox"
					checked={selectedPools.includes(token.id)}
					onChange={() => model.togglePool(token.id)}
					className="sr-only"
				/>
				<span
					aria-hidden
					className="flex h-[18px] w-[18px] flex-none items-center justify-center font-mono text-small font-bold text-white"
					style={{ background: token.color }}
				>
					{selectedPools.includes(token.id) ? "✓" : ""}
				</span>
				<span className="w-[34px] font-mono text-small font-semibold text-ink-2">
					{token.code}
				</span>
				<span className="flex-1 text-body font-medium text-ink">{token.name}</span>
			</label>
		);
	})}</>;
}

// compact is for the sidebar, where it sits beside the PROGRAMS label and
// must fit inside that line's height, or the whole sidebar drops when the
// first filter is picked and the button appears
export function ClearButton({ model, compact = false }: { model: GridModel; compact?: boolean }) {
	return (
		<button
			type="button"
			onClick={() => model.clearFilters("all")}
			className={
				compact
					? "cursor-pointer border border-line-strong bg-white px-2 py-px font-mono text-label font-medium leading-none text-ink-2"
					: "control font-mono text-small font-medium text-ink-2"
			}
		>
			CLEAR
		</button>
	);
}

// the word CLEAR wrapped the chip row to a second line once two pools were
// picked (the counts widen both chips), which shoves the grid down in focus
// mode, so on mobile it's a reset glyph sized like the focus toggle
export function ClearIconButton({ model }: { model: GridModel }) {
	return (
		<button
			type="button"
			onClick={() => model.clearFilters("all")}
			aria-label="Clear filters"
			title="Clear filters"
			className="control w-11 flex-none px-0 text-ink"
		>
			<svg
				aria-hidden
				viewBox="0 0 14 14"
				className="inline-block h-[14px] w-[14px] align-middle"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M1.6 7a5.4 5.4 0 1 0 1.6-3.8" />
				<path d="M1.4 1.6v3.2h3.2" />
			</svg>
		</button>
	);
}
