import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NoObjectGeneratedError, type LanguageModelUsage } from "ai";

/**
 * USD per 1M tokens, standard tier. Gemini bills reasoning ("thinking") tokens
 * at the output rate, and the SDK already counts them in outputTokens.
 * https://ai.google.dev/gemini-api/docs/pricing
 */
const PRICING: Record<string, { input: number; output: number }> = {
	"gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
	"gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

/** One model call, as written to the usage log. */
export type UsageRecord = {
	at: string;
	/** what the call was for, e.g. "pdf-extract" */
	task: string;
	/** pool id, or whatever the call was about */
	subject: string;
	model: string;
	/** false when the call threw — the tokens were usually still billed */
	ok: boolean;
	error?: string;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	cachedInputTokens: number;
	totalTokens: number;
	/** null when the model isn't in the pricing table */
	costUsd: number | null;
	durationMs: number;
	/** sha256 of the PDF, so a cost can be tied back to the document that caused it */
	pdfHash?: string;
};

export type UsageMeta = { task: string; subject: string; model: string; pdfHash?: string };

export const USAGE_LOG = path.join(process.cwd(), "data", "usage", "llm-usage.jsonl");

// every call this process made, for end-of-run totals
const sessionRecords: UsageRecord[] = [];

export function sessionUsage(task?: string): UsageRecord[] {
	return task ? sessionRecords.filter((r) => r.task === task) : [...sessionRecords];
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
	const price = PRICING[model];
	if (!price) return null;
	const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
	// micro-dollar precision is plenty and keeps the log readable
	return Math.round(cost * 1e6) / 1e6;
}

export function toUsageRecord(
	usage: LanguageModelUsage | undefined,
	meta: UsageMeta & { durationMs: number; error?: unknown }
): UsageRecord {
	const inputTokens = usage?.inputTokens ?? 0;
	const outputTokens = usage?.outputTokens ?? 0;
	const failed = meta.error !== undefined;
	return {
		at: new Date().toISOString(),
		task: meta.task,
		subject: meta.subject,
		model: meta.model,
		ok: !failed,
		...(failed ? { error: errorMessage(meta.error) } : {}),
		inputTokens,
		outputTokens,
		reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
		cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
		totalTokens: usage?.totalTokens ?? inputTokens + outputTokens,
		costUsd: estimateCostUsd(meta.model, inputTokens, outputTokens),
		durationMs: meta.durationMs,
		...(meta.pdfHash ? { pdfHash: meta.pdfHash } : {}),
	};
}

function errorMessage(err: unknown): string {
	const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
	// a schema failure can quote the whole response; the log only needs the gist
	return msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
}

/**
 * The SDK attaches usage to the error when the model answered but the answer
 * didn't parse — those tokens were billed. Network and API errors carry none.
 */
function usageFromError(err: unknown): LanguageModelUsage | undefined {
	return NoObjectGeneratedError.isInstance(err) ? err.usage : undefined;
}

/** Append-only, one JSON object per line, so runs accumulate without rewriting history. */
export async function appendUsage(records: UsageRecord[]): Promise<void> {
	if (records.length === 0) return;
	await mkdir(path.dirname(USAGE_LOG), { recursive: true });
	await appendFile(USAGE_LOG, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
}

async function record(r: UsageRecord): Promise<void> {
	sessionRecords.push(r);
	try {
		await appendUsage([r]);
	} catch (err) {
		// losing a log line must never fail the extraction it describes
		console.warn("could not write usage log:", err);
	}
}

/**
 * Run a model call and log its usage whether it succeeds or throws. `parse`
 * runs inside the tracked span, so a response that fails validation is logged
 * as a failed call with the tokens it cost.
 */
export async function trackUsage<R extends { usage: LanguageModelUsage }, T>(
	meta: UsageMeta,
	call: () => Promise<R>,
	parse: (result: R) => T
): Promise<T> {
	const startedAt = Date.now();
	let usage: LanguageModelUsage | undefined;
	let value: T;
	try {
		const result = await call();
		usage = result.usage;
		value = parse(result);
	} catch (err) {
		await record(
			toUsageRecord(usage ?? usageFromError(err), { ...meta, durationMs: Date.now() - startedAt, error: err })
		);
		throw err;
	}
	await record(toUsageRecord(usage, { ...meta, durationMs: Date.now() - startedAt }));
	return value;
}

/** One-line total for the end of a run, or null when no calls were made. */
export function formatUsageSummary(records: UsageRecord[]): string | null {
	if (records.length === 0) return null;
	const tokens = records.reduce((n, r) => n + r.totalTokens, 0);
	const cost = records.reduce((n, r) => n + (r.costUsd ?? 0), 0);
	const failed = records.filter((r) => !r.ok).length;
	return (
		`model usage: ${records.length} call(s)${failed ? ` (${failed} failed)` : ""}, ` +
		`${tokens} tokens, ~$${cost.toFixed(4)}`
	);
}
