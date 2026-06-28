const USER_AGENT = "Mozilla/5.0 (compatible; sf-pools-schedule-viewer/0.1)";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 4;

export type FetchOptions = {
	retries?: number;
	timeoutMs?: number;
};

function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

/**
 * fetch with a per-attempt timeout and exponential-backoff retries.
 * retries on network errors, timeouts, 429, and 5xx responses. 4xx (other
 * than 429) is returned as-is so the caller can decide what to do.
 */
export async function fetchWithRetry(
	url: string,
	init: RequestInit = {},
	opts: FetchOptions = {}
): Promise<Response> {
	const { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
	let lastErr: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const res = await fetch(url, {
				...init,
				signal: controller.signal,
				headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
			});
			// treat 429/5xx as transient and retry with backoff
			if (res.status === 429 || res.status >= 500) {
				throw new Error(`retryable status ${res.status} ${res.statusText} for ${url}`);
			}
			return res;
		} catch (err) {
			lastErr = err;
			if (attempt < retries) {
				const backoff = 1000 * 2 ** attempt; // 1s, 2s, 4s, 8s
				console.warn(
					`fetch attempt ${attempt + 1} failed for ${url} (${
						err instanceof Error ? err.message : String(err)
					}); retrying in ${backoff}ms`
				);
				await sleep(backoff);
			}
		} finally {
			clearTimeout(timer);
		}
	}

	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
	const res = await fetchWithRetry(url, {}, opts);
	if (!res.ok) throw new Error(`request failed ${res.status} ${res.statusText} for ${url}`);
	return res.text();
}

/** true if the buffer looks like a PDF (`%PDF-` magic bytes near the start). */
export function looksLikePdf(buf: Buffer): boolean {
	// the %PDF- header should appear within the first 1KB (some files have a
	// short preamble before it); checking a window is more robust than offset 0.
	return buf.subarray(0, 1024).includes(Buffer.from("%PDF-"));
}

export async function fetchPdfBuffer(url: string, opts?: FetchOptions): Promise<Buffer> {
	const res = await fetchWithRetry(url, {}, opts);
	if (!res.ok) throw new Error(`download failed ${res.status} ${res.statusText} for ${url}`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (!looksLikePdf(buf)) {
		const contentType = res.headers.get("content-type") ?? "unknown";
		throw new Error(
			`response for ${url} is not a PDF (content-type: ${contentType}, ${buf.length} bytes) — ` +
				`likely an error or HTML page`
		);
	}
	return buf;
}
