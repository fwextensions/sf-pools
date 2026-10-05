// Reports what the reader did to the grid, as a subscriber to the model, so
// the commands themselves know nothing about analytics
import {
	trackCategoryFilter,
	trackCellSelected,
	trackFiltersCleared,
	trackPoolFilter,
	trackProgramFilter,
} from "@/lib/analytics";
import type { GridChange } from "./grid-model";

export function trackGridChange(change: GridChange) {
	if (change.kind === "preview") return;
	const { action } = change;
	switch (action.type) {
		case "toggleTag":
			trackProgramFilter(action.tag, action.selected, action.total);
			break;
		case "toggleGroup":
			trackCategoryFilter(action.group, action.selected, action.total);
			break;
		case "togglePool":
			trackPoolFilter(action.pool, action.selected, action.total);
			break;
		case "clear":
			trackFiltersCleared(action.programs, action.pools, action.source);
			break;
		case "selectCell":
			// every click counts, even on the cell already selected; a drag
			// only when it ended on a cell
			if (action.cell) trackCellSelected(action.cell.day, action.cell.hour, action.source);
			break;
	}
}
