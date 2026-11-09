// Read the citywide PDFs linked from the Swimming Pools page, the yearly
// maintenance schedule and the admission fees, into
// public/data/maintenance_schedule.json and public/data/admission_fees.json.
// A PDF whose bytes match the saved file's hash isn't sent to the model
// again. A read that doesn't check out against the PDF's text keeps the
// saved file and warns, and so does a page or PDF that can't be fetched: the
// schedule pipeline runs after this, so a failure here never stops it.
//
//   --force    read the PDFs even when they haven't changed
//   --notify   send a notification when either file changes or a read fails
//   --dry-run  print what would be saved instead of saving it
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { fetchPdfBuffer, fetchText } from "./http";
import { readPdfLines } from "./read-pdf-lines";
import { sendNotification } from "./notify";
import { pacificToday } from "../src/lib/closures";
import { trackUsage } from "../src/lib/llm-usage";
import { SWIMMING_POOLS_URL, type MaintenanceData } from "../src/lib/maintenance";
import type { AdmissionFeesData } from "../src/lib/admission-fees";
import {
	FEES_PROMPT,
	FeesExtractSchema,
	findDocLinks,
	groundFees,
	groundMaintenance,
	MAINTENANCE_PROMPT,
	MaintenanceExtractSchema,
	type DocLink,
} from "../src/lib/aquatics-docs";

const OUT_DIR = path.join(process.cwd(), "public", "data");
const MAINTENANCE_FILE = path.join(OUT_DIR, "maintenance_schedule.json");
const FEES_FILE = path.join(OUT_DIR, "admission_fees.json");

const EXTRACT_MODEL = process.env.EXTRACT_MODEL || "gemini-3.5-flash-lite";

const force = process.argv.includes("--force");
const notify = process.argv.includes("--notify");
const dryRun = process.argv.includes("--dry-run");

async function loadSaved<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf-8")) as T;
	} catch {
		return null;
	}
}

async function extract<S extends z.ZodType>(task: string, schema: S, prompt: string, pdf: Buffer, pdfHash: string) {
	return trackUsage(
		{ task, subject: "citywide", model: EXTRACT_MODEL, pdfHash },
		() =>
			generateText({
				model: google(EXTRACT_MODEL),
				output: Output.object({ schema }),
				temperature: 0,
				maxRetries: 3,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: prompt },
							{ type: "file", mediaType: "application/pdf", data: pdf },
						],
					},
				],
			}),
		(result) => schema.parse(result.output) as z.infer<S>
	);
}

type Doc<T> = {
	label: string;
	file: string;
	link: DocLink | null;
	read: (pdf: Buffer, pdfHash: string, link: DocLink) => Promise<{ data: T; problems: string[] }>;
	summarize: (data: T) => string[];
};

/** fetch, read and save one document; returns what changed, for the notification */
async function update<T extends { source: string; pdfHash: string }>(doc: Doc<T>): Promise<string[]> {
	if (!doc.link) throw new Error(`no ${doc.label} link on ${SWIMMING_POOLS_URL}`);
	const pdf = await fetchPdfBuffer(doc.link.url);
	const pdfHash = createHash("sha256").update(pdf).digest("hex");
	const saved = await loadSaved<T>(doc.file);
	if (saved?.pdfHash === pdfHash && !force) {
		// the link can move to a new DocumentCenter id with the same file
		if (saved.source !== doc.link.url && !dryRun) {
			await writeFile(doc.file, JSON.stringify({ ...saved, source: doc.link.url }, null, "\t") + "\n");
		}
		console.log(`${doc.label}: unchanged`);
		return [];
	}

	console.log(`${doc.label}: reading ${doc.link.url}`);
	const { data, problems } = await doc.read(pdf, pdfHash, doc.link);
	if (problems.length) {
		throw new Error(`${doc.label} didn't check out against the PDF, keeping the saved file:\n${problems.join("\n")}`);
	}
	const json = JSON.stringify(data, null, "\t") + "\n";
	if (dryRun) {
		console.log(json);
		return [];
	}
	await writeFile(doc.file, json);
	console.log(`wrote ${path.relative(process.cwd(), doc.file)}`);
	return [`${doc.label} (${doc.link.text || doc.link.url}):`, ...doc.summarize(data)];
}

async function main() {
	const today = pacificToday();
	const html = await fetchText(SWIMMING_POOLS_URL);
	const links = findDocLinks(html, SWIMMING_POOLS_URL);

	const maintenance: Doc<MaintenanceData> = {
		label: "maintenance schedule",
		file: MAINTENANCE_FILE,
		link: links.maintenance,
		async read(pdf, pdfHash, link) {
			const extracted = await extract("maintenance-extract", MaintenanceExtractSchema, MAINTENANCE_PROMPT, pdf, pdfHash);
			const { entries, problems } = groundMaintenance(extracted, readPdfLines(pdf));
			if (!entries.length) problems.push("no dated entries");
			return {
				data: { source: link.url, pdfHash, title: extracted.title.trim(), lastUpdated: today, entries },
				problems,
			};
		},
		summarize: (data) =>
			data.entries.map((e) => `• ${e.poolIds.join(", ") || "all pools"}: ${e.startDate}–${e.endDate} ${e.reason}`),
	};

	const fees: Doc<AdmissionFeesData> = {
		label: "admission fees",
		file: FEES_FILE,
		link: links.fees,
		async read(pdf, pdfHash, link) {
			const extracted = await extract("fees-extract", FeesExtractSchema, FEES_PROMPT, pdf, pdfHash);
			const { groups, problems } = groundFees(extracted, readPdfLines(pdf));
			if (!groups.length) problems.push("no fees");
			return {
				data: { source: link.url, pdfHash, effectiveDate: extracted.effectiveDate, lastUpdated: today, groups },
				problems,
			};
		},
		summarize: (data) => [
			`effective ${data.effectiveDate ?? "?"}`,
			...data.groups.map((g) => `• ${g.name}: drop-in $${g.fees[0]?.price ?? "?"}`),
		],
	};

	const changes: string[] = [];
	const failures: string[] = [];
	for (const run of [() => update(maintenance), () => update(fees)]) {
		try {
			changes.push(...(await run()));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`⚠️  ${message}`);
			failures.push(message);
		}
	}

	if (notify && changes.length) {
		await sendNotification({
			title: "🏊 Citywide pool documents changed",
			message: changes.join("\n"),
			priority: -1,
			url: SWIMMING_POOLS_URL,
			urlTitle: "Swimming Pools page",
		});
	}
	if (notify && failures.length) await notifyFailure(failures.join("\n\n"));
}

function notifyFailure(message: string) {
	return sendNotification({ title: "⚠️ Citywide pool documents not updated", message, url: SWIMMING_POOLS_URL });
}

main().catch(async (error) => {
	// the page itself couldn't be read; the schedule pipeline still runs
	const message = error instanceof Error ? error.message : String(error);
	console.warn(`⚠️  couldn't read the Swimming Pools page: ${message}`);
	if (notify) await notifyFailure(message);
});
