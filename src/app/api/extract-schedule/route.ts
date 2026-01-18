import { NextRequest, NextResponse } from "next/server";
import { extractScheduleFromPdf } from "@/lib/pdf-processor";
import { getPoolIdFromName, getPoolById } from "@/lib/pool-mapping";
import { toTitleCase } from "@/lib/program-taxonomy";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureDir(dir: string) {
	await fs.mkdir(dir, { recursive: true });
}

async function fetchPdfBufferFromUrl(url: string): Promise<Buffer> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`failed to fetch PDF: ${res.status} ${res.statusText}`);
	}
	const arrayBuffer = await res.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

async function discoverMlkPdfUrl(): Promise<{ pdfUrl: string; sfRecParkUrl: string }> {
	const facilityUrl =
		"https://sfrecpark.org/Facilities/Facility/Details/Martin-Luther-King-Jr-Pool-216";
	const res = await fetch(facilityUrl, {
		headers: {
			"user-agent": "Mozilla/5.0 (compatible; sf-pools-schedule-viewer/0.1)",
		},
	});
	if (!res.ok) {
		throw new Error(`failed to fetch facility page: ${res.status} ${res.statusText}`);
	}
	const html = await res.text();
	// heuristic: look for DocumentCenter/View link
	const match = html.match(/href=\"(https:\/\/sfrecpark\.org\/DocumentCenter\/View\/[^"]+)\"/i);
	if (!match) {
		throw new Error("could not find schedule PDF link on facility page");
	}
	return { pdfUrl: match[1], sfRecParkUrl: facilityUrl };
}

export async function POST(_req: NextRequest) {
	try {
		const envUrl = process.env.MLK_PDF_URL?.trim();
		let pdfUrl = envUrl || "";
		let sfRecParkUrl = "";

		if (!pdfUrl) {
			const discovered = await discoverMlkPdfUrl();
			pdfUrl = discovered.pdfUrl;
			sfRecParkUrl = discovered.sfRecParkUrl;
		}

		const pdfBuffer = await fetchPdfBufferFromUrl(pdfUrl);
		const schedules = await extractScheduleFromPdf(pdfBuffer, {
			pdfScheduleUrl: pdfUrl,
			sfRecParkUrl,
		});

		// add/ensure scheduleLastUpdated = date of processing (YYYY-MM-DD)
		const today = new Date().toISOString().slice(0, 10);
		const enriched = schedules.map((s) => {
			// get the original pool name from the data source
			const originalName = s.name || "";
			
			// populate new id field using getPoolIdFromName
			const poolId = getPoolIdFromName(originalName);
			const id = poolId ?? "unknown";
			
			// populate shortName and nameTitle using getPoolById
			let shortName: string;
			let nameTitle: string;
			if (poolId) {
				const poolMeta = getPoolById(poolId);
				shortName = poolMeta?.shortName ?? toTitleCase(originalName);
				nameTitle = poolMeta?.displayName ?? toTitleCase(originalName);
			} else {
				// fallback to toTitleCase for unmatched pools
				shortName = toTitleCase(originalName);
				nameTitle = toTitleCase(originalName);
			}
			
			return {
				...s,
				id,
				name: originalName,
				shortName,
				nameTitle,
				scheduleLastUpdated: s.scheduleLastUpdated ?? today,
			};
		});

		const publicDir = path.join(process.cwd(), "public");
		const dataDir = path.join(publicDir, "data");
		await ensureDir(dataDir);
		const outputPath = path.join(dataDir, "all_schedules.json");
		const payload = JSON.stringify(enriched, null, "\t");
		await fs.writeFile(outputPath, payload, "utf-8");

		return NextResponse.json({ ok: true, count: enriched.length, pdfUrl });
	} catch (err) {
		console.error("extract-schedule error", err);
		return NextResponse.json(
			{ ok: false, error: err instanceof Error ? err.message : String(err) },
			{ status: 500 }
		);
	}
}
