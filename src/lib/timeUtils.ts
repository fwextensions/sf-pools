export function formatTime(timeStr: string | null): string
{
	if (!timeStr) {
		return "";
	}
	const [hourStr, minuteStr] = timeStr.split(":");
	if (!hourStr || !minuteStr) {
		return timeStr; // Return original if format is unexpected
	}

	let hours = parseInt(hourStr, 10);
	const minutes = parseInt(minuteStr, 10);

	if (isNaN(hours) || isNaN(minutes)) {
		return timeStr; // Return original if parsing fails
	}

	const period = hours >= 12 ? "p" : "a";
	hours = hours % 12;
	if (hours === 0) { // Handle midnight (00:xx) and noon (12:xx)
		hours = 12;
	}

	return `${hours}:${minutes < 10 ? "0" + minutes : minutes}${period}`;
}
