import { Fragment } from "react";

/**
 * Program names carry unspaced slashes — "Swim Lessons (General/Youth/Community)"
 * is a single 25-character word as far as the browser is concerned, which
 * overflows a seventh-of-the-width day column instead of wrapping. Offer a break
 * opportunity after each slash. Slashes that already have a space beside them
 * ("Senior Swim / Therapy Swim") are unaffected: the space is a break
 * opportunity in the same place, so the extra <wbr> changes nothing.
 */
export default function ProgramName({ name }: { name: string }) {
	const parts = name.split("/");
	return (
		<>
			{parts.map((part, i) => (
				<Fragment key={i}>
					{part}
					{i < parts.length - 1 ? (
						<>
							/
							<wbr />
						</>
					) : null}
				</Fragment>
			))}
		</>
	);
}
