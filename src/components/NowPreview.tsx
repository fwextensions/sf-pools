"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PoolSchedule } from "@/lib/schedule-schema";
import type { CityHoliday } from "@/lib/city-holidays";
import NowSoon, { pacificMoment } from "@/components/NowSoon";

type Props = {
	all: PoolSchedule[];
	upcoming: PoolSchedule[];
	holidays: CityHoliday[];
};

/** the current San Francisco date and time, "2026-11-26T10:00" */
function pacificNow(): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Los_Angeles",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date());
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// kept next to Now & Soon's own params, which it keeps in turn
function writeAt(at: string) {
	const params = new URLSearchParams(window.location.search);
	params.delete("at");
	const rest = params.toString();
	window.history.replaceState(null, "", `${window.location.pathname}?at=${at}${rest ? `&${rest}` : ""}`);
}

/**
 * Now & Soon at a chosen moment: the same component and the same pool
 * calendar, handed a fixed San Francisco time in place of the live clock.
 * ?at=2026-11-26T10:00 picks it; without one it starts from the current time.
 */
export default function NowPreview({ all, upcoming, holidays }: Props) {
	const searchParams = useSearchParams();
	const [at, setAt] = useState(() => {
		const param = searchParams.get("at");
		return param && pacificMoment(param) ? param : pacificNow();
	});
	const [date, time] = at.split("T");

	const change = (next: string) => {
		if (!pacificMoment(next)) return;
		setAt(next);
		writeAt(next);
	};

	return (
		<>
			<div className="flex flex-wrap items-center gap-2 border-b-2 border-ink pb-3">
				<span className="mr-2 font-mono text-label font-semibold uppercase tracking-[.08em] text-ink">
					Preview at
				</span>
				<label className="flex">
					<span className="sr-only">Date</span>
					<input
						type="date"
						value={date}
						onChange={(e) => change(`${e.target.value}T${time}`)}
						className="control text-small text-ink focus:border-ink focus:outline-none"
					/>
				</label>
				<label className="flex">
					<span className="sr-only">Time</span>
					<input
						type="time"
						value={time}
						step={300}
						onChange={(e) => change(`${date}T${e.target.value.slice(0, 5)}`)}
						className="control text-small text-ink focus:border-ink focus:outline-none"
					/>
				</label>
				<button type="button" onClick={() => change(pacificNow())} className="control text-small text-ink">
					Now
				</button>
				<span className="text-small text-ink-2">San Francisco time</span>
			</div>
			<NowSoon all={all} upcoming={upcoming} holidays={holidays} at={at} />
		</>
	);
}
