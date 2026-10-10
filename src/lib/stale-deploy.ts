/**
 * Recovery for a tab that outlived its deploy.
 *
 * A page keeps running the JS of the deploy it loaded. When it later needs a
 * chunk it hasn't fetched yet (a route it hasn't visited, a lazy component),
 * it asks for that chunk by the old build's file name, and after a new deploy
 * the server no longer has it. The router throws a ChunkLoadError and the
 * reader lands on an error page, though nothing is broken: a full reload picks
 * up the new deploy and works.
 *
 * So the error boundaries reload once on their own. The timestamp in
 * sessionStorage stops a loop if the reload hits the same error, which would
 * mean a genuinely missing chunk rather than a stale tab.
 */

const RELOADED_AT_KEY = "stale-deploy-reloaded-at";
const RETRY_AFTER_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.name === "ChunkLoadError"
		|| /Failed to load chunk|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(error.message);
}

// true when a reload has been started, so the caller can skip its error UI
export function reloadForNewDeploy(error: unknown): boolean {
	if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
	try {
		const last = Number(sessionStorage.getItem(RELOADED_AT_KEY));
		if (last && Date.now() - last < RETRY_AFTER_MS) return false;
		sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
	} catch {
		// without sessionStorage there's no loop guard, so don't risk one
		return false;
	}
	window.location.reload();
	return true;
}
