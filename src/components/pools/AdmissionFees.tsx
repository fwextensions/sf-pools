import { ExternalLinkIcon } from "@/components/icons";
import type { AdmissionFeesData } from "@/lib/admission-fees";
import { formatScheduleDate } from "@/lib/utils";

const dollars = (price: number) => `$${price.toLocaleString("en-US")}`;

/**
 * What a swim costs, from the aquatics division's fee notice. The prices are
 * the same at every pool, so they sit once under the pools list: a block per
 * kind of swimmer, two side by side on wider screens.
 */
export default function AdmissionFees({ fees }: { fees: AdmissionFeesData }) {
	const effective = fees.effectiveDate
		? formatScheduleDate(fees.effectiveDate, { month: "long", day: "numeric", year: "numeric" })
		: null;

	return (
		<section aria-labelledby="admission-fees" className="mt-12 border-t border-line pt-2.5">
			<h2 id="admission-fees" className="font-mono text-label font-semibold tracking-[.08em] text-ink-2">
				ADMISSION FEES
			</h2>
			<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">
				The same at every pool{effective ? `, since ${effective}` : ""}.{" "}
				<a href={fees.source} target="_blank" rel="noreferrer" className="link-inline">
					Fee notice PDF<ExternalLinkIcon />
				</a>
			</p>

			<div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 min-[560px]:grid-cols-2">
				{fees.groups.map((group) => (
					<table key={group.name} className="w-full border-collapse self-start text-body">
						<caption className="border-b-2 border-ink pb-1 text-left">
							<span className="text-heading font-semibold leading-tight text-ink">{group.name}</span>
							{group.detail ? <span className="ml-2 text-ink-2">{group.detail}</span> : null}
						</caption>
						<tbody>
							{group.fees.map((fee) => (
								<tr key={fee.name} className="border-b border-line">
									<th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
										{fee.name}
									</th>
									<td className="py-1.5 text-right align-top tabular-nums text-ink">
										{dollars(fee.price)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				))}
			</div>
		</section>
	);
}
