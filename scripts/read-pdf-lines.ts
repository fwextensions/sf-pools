import { extractTextWithPositions } from "@firecrawl/pdf-inspector";
import type { TextLine } from "@/lib/pdf-table";

/**
 * The positioned text runs of a PDF. pdf-inspector decodes fonts from their
 * embedded programs, so it reads PDFs whose character maps are broken, like
 * the Microsoft Print to PDF schedules where every letter is shifted by a
 * fixed amount and other extractors return gibberish.
 */
export function readPdfLines(pdf: Buffer): TextLine[] {
	return extractTextWithPositions(pdf)
		.filter((item) => item.itemType === "Text" && item.text.trim() && item.rotation === 0)
		.map((item) => ({ page: item.page, x: item.x, y: item.y, width: item.width, text: item.text }));
}
