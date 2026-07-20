// re-apply the program taxonomy to public/data/all_schedules.json without
// re-extracting PDFs. Recomputes programName/programNameCanonical from
// programNameOriginal (falling back to the current programName), so taxonomy
// changes in src/lib/program-taxonomy.ts can be rolled out to preserved data.
import fs from "node:fs/promises";
import path from "node:path";
import { findCanonicalProgram, normalizeProgramName } from "@/lib/program-taxonomy";

async function main() {
	const file = path.join(process.cwd(), "public", "data", "all_schedules.json");
	const data = JSON.parse(await fs.readFile(file, "utf8"));
	const changes = new Map<string, string>();

	for (const s of data.schedules ?? data) {
		for (const p of s.programs || []) {
			const original = p.programNameOriginal || p.programName;
			const canonical = findCanonicalProgram(original) ?? normalizeProgramName(original);
			if (p.programName !== canonical) changes.set(p.programName, canonical);
			p.programNameOriginal = original;
			p.programName = canonical;
			p.programNameCanonical = canonical;
		}
	}

	await fs.writeFile(file, JSON.stringify(data, null, "\t") + "\n");
	for (const [from, to] of [...changes].sort()) console.log(`${from} -> ${to}`);
	console.log(`${changes.size} distinct renames`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
