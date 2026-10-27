"use client";

import PoolChip from "@/components/PoolChip";
import { POOL_TOKENS } from "@/lib/pool-tokens";
import { tagLabel } from "@/lib/program-taxonomy";
import { Undo2 } from "lucide-react";
import type { FilterView, GridModel } from "@/lib/grid/grid-model";

// The program and pool pickers, shared by the desktop sidebar and the mobile
// panels, and the buttons that clear them.

// the program categories, one block per group with a rule between them. The
// groups have no heading or checkbox of their own; the rule is enough to
// keep the open swims apart from the lessons and the private bookings.
export function CategoryRows({
	model,
	filters,
	compact,
}: {
	model: GridModel;
	filters: FilterView;
	compact: boolean;
}) {
	const tagSet = new Set(filters.tags);
	return <div>{filters.groups.map((cat) => (
		<div
			key={cat.id}
			// inset to match the PROGRAMS and POOLS rules, and the last group
			// leaves the rule under it to the POOLS heading
			className={`mx-4 flex flex-col gap-0.5 border-b border-line last:border-b-0 ${compact ? "py-1.5" : "py-2"}`}
		>
			{cat.tags.map((name) => (
				<label
					key={name}
					className="flex cursor-pointer items-center gap-2.5 py-1.5"
				>
					<input
						type="checkbox"
						checked={tagSet.has(name)}
						onChange={() => model.toggleTag(name)}
						className="picker-checkbox"
					/>
					<span className="flex-1 text-body text-ink">{tagLabel(name)}</span>
					<span className="font-mono text-small font-medium text-ink-2">
						{filters.tagCounts.get(name)}
					</span>
				</label>
			))}
		</div>
	))}</div>;
}

// a checkbox like the program rows', then the pool's chip and name
export function PoolRows({ model, filters }: { model: GridModel; filters: FilterView }) {
	const selectedPools = filters.pools;
	return <div className="mx-4 flex flex-col gap-0.5 py-1.5">{POOL_TOKENS.map((token) => {
		return (
			<label
				key={token.id}
				className="flex cursor-pointer items-center gap-2.5 py-1.5"
			>
				<input
					type="checkbox"
					checked={selectedPools.includes(token.id)}
					onChange={() => model.togglePool(token.id)}
					className="picker-checkbox"
				/>
				<PoolChip token={token} />
				<span className="flex-1 text-body text-ink">{token.name}</span>
			</label>
		);
	})}</div>;
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
					? "cursor-pointer border border-line-strong bg-page px-2 py-px font-mono text-label font-medium leading-none text-ink-2"
					: "control font-mono text-small font-medium text-ink-2"
			}
		>
			CLEAR
		</button>
	);
}

// the word CLEAR wrapped the chip row to a second line once two pools were
// picked (the counts widen both chips), which shoves the grid down in focus
// mode, so on mobile it's Lucide's undo icon sized like the focus toggle
export function ClearIconButton({ model }: { model: GridModel }) {
	return (
		<button
			type="button"
			onClick={() => model.clearFilters("all")}
			aria-label="Clear filters"
			title="Clear filters"
			className="control w-11 flex-none px-0 text-ink"
		>
			<Undo2 aria-hidden className="inline-block h-4 w-4 align-middle" />
		</button>
	);
}
