"use client";

import { POOL_TOKENS } from "@/lib/pool-tokens";
import { tagLabel } from "@/lib/program-taxonomy";
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
		<div key={cat.id} className="border-b border-[#edf1f3]">
			<div className={`flex items-center gap-2.5 ${compact ? "px-4 py-2" : "px-4 py-2.5"}`}>
				<button
					type="button"
					aria-label={`Toggle every ${cat.label} tag`}
					aria-pressed={cat.allSelected}
					onClick={() => model.toggleGroup(cat.id)}
					className="flex h-[18px] w-[18px] flex-none cursor-pointer items-center justify-center border-2 border-[#0e2733] plex-mono text-[12px] font-bold text-white"
					style={{
						background: cat.allSelected ? "#0e2733" : cat.someSelected ? "#5a8ba3" : "#fff",
					}}
				>
					{cat.allSelected ? "✓" : cat.someSelected ? "–" : ""}
				</button>
				<button
					type="button"
					onClick={() => model.toggleGroup(cat.id)}
					className="flex-1 cursor-pointer text-left text-[14px] font-semibold text-[#0e2733]"
				>
					{cat.label}{" "}
					<span className="plex-mono text-[12px] font-medium text-[#8a9aa4]">
						({cat.tags.length})
					</span>
				</button>
				<button
					type="button"
					aria-label={`${expanded[cat.id] ? "Collapse" : "Expand"} ${cat.label}`}
					onClick={() => onToggleExpanded(cat.id)}
					// the glyph is small inside its em box, so it needs roughly
					// double the label's size to carry the same weight as the
					// checkbox and text it sits with. leading-none keeps that off
					// the row height
					className="cursor-pointer px-2 py-1 plex-mono text-[26px] font-medium leading-none text-[#5a707c]"
				>
					{expanded[cat.id] ? "▴" : "▾"}
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
							<span className="flex-1 text-[14px] text-[#37474f]">{tagLabel(name)}</span>
							<span className="plex-mono text-[12px] font-medium text-[#8a9aa4]">
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
				className="flex cursor-pointer items-center gap-2.5 border-b border-[#edf1f3] px-4 py-2"
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
					className="flex h-[18px] w-[18px] flex-none items-center justify-center plex-mono text-[12px] font-bold text-white"
					style={{ background: token.color }}
				>
					{selectedPools.includes(token.id) ? "✓" : ""}
				</span>
				<span className="w-[34px] plex-mono text-[12px] font-semibold text-[#5a707c]">
					{token.code}
				</span>
				<span className="flex-1 text-[14px] font-medium text-[#0e2733]">{token.name}</span>
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
			className={`cursor-pointer border border-[#c4d2d9] bg-white plex-mono font-medium text-[#5a707c] ${
				compact ? "px-2 py-px text-[11px] leading-none" : "px-2.5 py-1.5 text-[12px]"
			}`}
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
			className="w-9 flex-none cursor-pointer border-[1.5px] border-[#0e2733] bg-white px-2.5 py-2 text-center plex-mono text-[12px] font-semibold text-[#0e2733]"
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
