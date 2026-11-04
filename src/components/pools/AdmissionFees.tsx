import { ExternalLinkIcon } from "@/components/icons";
import { passPrices, type AdmissionFeesData } from "@/lib/admission-fees";
import { formatScheduleDate } from "@/lib/utils";

const dollars = (price: number) => `$${price.toLocaleString("en-US")}`;

/**
 * What a swim costs, from the aquatics division's fee notice. The prices are
 * the same at every pool, so they sit once under the pools list: the drop-in
 * and 10-visit prices, each with what every group pays, and the rest left to
 * the notice.
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
			{/* as the Swimming Pools page on sfrecpark.org puts it */}
			<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">
				To purchase a swim pass or register for a class, visit{" "}
				<a href="https://sfrecpark.org/register" target="_blank" rel="noreferrer" className="link-inline">
					sfrecpark.org/register<ExternalLinkIcon />
				</a>
				. Drop-in visitors can pay the entry fee with exact cash or credit card at the pool entrance.
			</p>

			<div className="mt-4 grid grid-cols-1 gap-x-8 min-[560px]:grid-cols-2">
				{passPrices(fees.groups).map((pass) => (
					<div key={pass.name} className="border-t border-line py-2.5">
						<h3 className="text-heading font-semibold leading-tight text-ink">{pass.name}</h3>
						<ul className="mt-1 flex flex-col gap-0.5 text-body">
							{pass.prices.map(({ groups, price }) => (
								<li key={price} className="flex items-baseline justify-between gap-3">
									<span className="text-ink">
										{groups.map((group, i) => (
											<span key={group.name}>
												{i ? " / " : ""}
												{groupLabel(group)}
											</span>
										))}
									</span>
									<span className="tabular-nums font-semibold text-ink">{dollars(price)}</span>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>

			<p className="mt-2 text-body text-ink-2">
				{effective ? `Effective ${effective}. ` : ""}The full list of passes is in the{" "}
				<a href={fees.source} target="_blank" rel="noreferrer" className="link-inline">
					fee notice PDF<ExternalLinkIcon />
				</a>
				.
			</p>
		</section>
	);
}

/** "Children 0-17", with the ages quieter; "Medi-Cal" for a group named by who qualifies */
function groupLabel({ name, detail }: { name: string; detail: string | null }) {
	if (detail && !/\d/.test(detail)) return detail.replace(/\s+recipients?$/i, "");
	return (
		<>
			{name}
			{detail ? <span className="text-ink-2"> {detail}</span> : null}
		</>
	);
}
