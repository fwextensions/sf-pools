// What a swim costs, from the aquatics division's fee notice linked on the
// Swimming Pools page. The prices are the same at every pool.

/** one price on the notice, e.g. "Rec Swim and Lap Swim Drop-in", $8 */
export type Fee = {
	name: string;
	/** whole dollars */
	price: number;
};

/** the prices for one kind of swimmer */
export type FeeGroup = {
	/** "Children", "Adult", "Seniors", "Economic Need" */
	name: string;
	/** the ages or who qualifies, as the notice puts it ("0-17", "Medi-Cal recipients") */
	detail: string | null;
	fees: Fee[];
};

/** public/data/admission_fees.json */
export type AdmissionFeesData = {
	/** the PDF the fees were read from */
	source: string;
	/** sha256 of the PDF's bytes, so an unchanged PDF isn't read again */
	pdfHash: string;
	/** YYYY-MM-DD the prices took effect, when the notice says */
	effectiveDate: string | null;
	lastUpdated: string;
	groups: FeeGroup[];
};
