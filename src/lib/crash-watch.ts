/**
 * Notices when a page died without closing, and says so on the next load.
 *
 * A crashed or killed page can't report anything: when Safari's web content
 * process dies, no JS runs, so PostHog's exception capture never sees it.
 * Instead each page keeps a small record in localStorage while it is open,
 * refreshed by a heartbeat, and marks it closed on pagehide. A later load
 * that finds a record that was never closed reports it as
 * page_crash_suspected.
 *
 * Two kinds of finding:
 * - "same_tab": the record belongs to this tab (its id is kept in
 *   sessionStorage, which survives a reload of the same tab). This is the
 *   reload Safari does after its web process dies.
 * - "orphaned": a record from another tab that hasn't been seen for
 *   ORPHAN_AFTER_MS. Catches tabs whose session Safari lost entirely, at the
 *   cost of the odd false alarm from a tab left in the background for a day.
 *
 * iOS can kill a background tab without firing pagehide, so a record that
 * ends with `visible: false` is often a quiet eviction rather than a crash.
 * One that ends visible is the interesting case.
 *
 * Off switch: set NEXT_PUBLIC_CRASH_WATCH=off and redeploy. It also does
 * nothing without a PostHog key, since the report goes through analytics.
 */

export const RECORD_PREFIX = "crash-watch:";
const TAB_ID_KEY = "crash-watch-tab";
const HEARTBEAT_MS = 30_000;
export const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;

export interface PageRecord {
	id: string;
	path: string;
	deploy: string | null;
	startedAt: number;
	lastSeen: number;
	beats: number;
	visible: boolean;
	webglLost: number;
	closed: boolean;
}

export interface CrashSuspect {
	kind: "same_tab" | "orphaned";
	record: PageRecord;
}

// the unclosed records worth reporting, given every record in storage
export function findSuspects(records: PageRecord[], tabId: string | null, now: number): CrashSuspect[] {
	const suspects: CrashSuspect[] = [];
	for (const record of records) {
		if (record.closed) continue;
		if (record.id === tabId) {
			suspects.push({ kind: "same_tab", record });
		} else if (now - record.lastSeen > ORPHAN_AFTER_MS) {
			suspects.push({ kind: "orphaned", record });
		}
	}
	return suspects;
}

// what goes to PostHog: durations in seconds, no raw timestamps
export function suspectProperties({ kind, record }: CrashSuspect, now: number, deploy: string | null) {
	return {
		kind,
		page: record.path,
		deploy: record.deploy,
		same_deploy: record.deploy === deploy,
		lived_s: Math.round((record.lastSeen - record.startedAt) / 1000),
		since_last_seen_s: Math.round((now - record.lastSeen) / 1000),
		visible_at_end: record.visible,
		webgl_lost: record.webglLost,
		beats: record.beats,
	};
}

function readRecords(storage: Storage): PageRecord[] {
	const records: PageRecord[] = [];
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (!key?.startsWith(RECORD_PREFIX)) continue;
		try {
			records.push(JSON.parse(storage.getItem(key) ?? ""));
		} catch {
			// a record we can't read is one we can't report; drop it below
			records.push({ id: key.slice(RECORD_PREFIX.length), closed: true } as PageRecord);
		}
	}
	return records;
}

function newId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function installCrashWatch(report: (properties: ReturnType<typeof suspectProperties>) => void) {
	if (typeof window === "undefined") return;
	if (process.env.NEXT_PUBLIC_CRASH_WATCH === "off") return;

	let local: Storage;
	let session: Storage;
	try {
		local = window.localStorage;
		session = window.sessionStorage;
		// private modes and blocked storage can throw on first use
		local.getItem(TAB_ID_KEY);
	} catch {
		return;
	}

	const deploy = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
	const now = Date.now();
	let tabId: string | null = null;
	try {
		tabId = session.getItem(TAB_ID_KEY);
	} catch {
		// fine: only same-tab findings are lost
	}

	try {
		const records = readRecords(local);
		for (const suspect of findSuspects(records, tabId, now)) {
			report(suspectProperties(suspect, now, deploy));
		}
		// everything found so far is either reported or closed, so it goes;
		// other live tabs rewrite theirs on their next heartbeat
		for (const record of records) {
			if (record.closed || record.id === tabId || now - record.lastSeen > ORPHAN_AFTER_MS) {
				local.removeItem(RECORD_PREFIX + record.id);
			}
		}
	} catch {
		// reporting is best effort; still watch this page
	}

	if (!tabId) {
		tabId = newId();
		try {
			session.setItem(TAB_ID_KEY, tabId);
		} catch {
			// no sessionStorage: this page can only ever be found as an orphan
		}
	}

	const record: PageRecord = {
		id: tabId,
		path: location.pathname + location.search,
		deploy,
		startedAt: now,
		lastSeen: now,
		beats: 0,
		visible: document.visibilityState === "visible",
		webglLost: 0,
		closed: false,
	};
	const key = RECORD_PREFIX + tabId;

	const save = () => {
		record.lastSeen = Date.now();
		record.path = location.pathname + location.search;
		record.visible = document.visibilityState === "visible";
		try {
			local.setItem(key, JSON.stringify(record));
		} catch {
			// a full or blocked store just means no record this beat
		}
	};

	save();
	setInterval(() => {
		record.beats++;
		save();
	}, HEARTBEAT_MS);
	document.addEventListener("visibilitychange", save);
	// webglcontextlost doesn't bubble, but a capturing listener still sees it
	window.addEventListener("webglcontextlost", () => {
		record.webglLost++;
		save();
	}, true);
	window.addEventListener("pagehide", () => {
		record.closed = true;
		save();
	});
	// back from the bfcache: the page is alive again
	window.addEventListener("pageshow", (event) => {
		if (!event.persisted) return;
		record.closed = false;
		save();
	});
}
