// find_sessions as a plain GET, for agents and scripts that fetch URLs rather
// than speak MCP: /api/sessions?when=soon&program=lap&pools=balboa,mlk.
// Takes the same parameters as the MCP tool, with the grid's names for the
// ones they share (program, pools), and returns the same JSON.
import { loadSwimAnswers, momentFor, sessionQueryFromParams } from "@/lib/agent-answers";
import { SwimAnswerError } from "@/lib/swim-answers";

const HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Content-Type": "application/json; charset=utf-8",
};

export async function GET(request: Request): Promise<Response> {
	const params = new URL(request.url).searchParams;
	try {
		const query = sessionQueryFromParams(params);
		const answer = (await loadSwimAnswers()).findSessions(query, momentFor(params.get("at")));
		// "now" moves on every minute; explicit dates only change with a deploy,
		// which starts a fresh cache
		const maxAge = query.when || !query.from ? 60 : 3600;
		return new Response(JSON.stringify(answer), {
			headers: { ...HEADERS, "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` },
		});
	} catch (error) {
		if (!(error instanceof SwimAnswerError)) throw error;
		return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: HEADERS });
	}
}
