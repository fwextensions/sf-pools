import { describe, it, expect, jest } from "@jest/globals";
import { createMcpHandler } from "mcp-handler";
import type { PoolSchedule } from "@/lib/schedule-schema";
import { createSwimAnswers } from "./swim-answers";
import { sessionQueryFromParams } from "./agent-answers";
import { MCP_INSTRUCTIONS, registerSwimTools } from "./mcp-tools";

const LAP = ["access:drop-in", "activity:lap", "program:lap"];

const pool = (id: string, name: string, rows: Array<[string, string, string]>) =>
	({
		id,
		name: `${name} Aquatics Center`,
		nameTitle: `${name} Pool`,
		shortName: name,
		programs: rows.map(([dayOfWeek, startTime, endTime]) => ({
			programName: "Lap Swim",
			title: "Lap Swim",
			dayOfWeek,
			startTime,
			endTime,
			tags: LAP,
		})),
	}) as unknown as PoolSchedule;

const answers = createSwimAnswers({
	schedules: [
		pool("balboa", "Balboa", [["Friday", "11:00a", "1:00p"]]),
		pool("rossi", "Rossi", [["Friday", "2:00p", "3:00p"]]),
	],
});
const handler = createMcpHandler((server) => registerSwimTools(server, async () => answers), {
	serverInfo: { name: "sf-pools", version: "test" },
	instructions: MCP_INSTRUCTIONS,
});

let id = 0;

// one JSON-RPC call the way a 2025-era Streamable HTTP client makes it, with
// the result read back out of the event stream
async function call(method: string, params: object = {}) {
	const response = await handler(
		new Request("http://localhost/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				"mcp-protocol-version": "2025-06-18",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
		})
	);
	const body = await response.text();
	const data = body.split("\n").find((line) => line.startsWith("data: "));
	return JSON.parse(data ? data.slice(6) : body);
}

const tool = (name: string, args: object = {}) => call("tools/call", { name, arguments: args });

describe("the MCP server", () => {
	// the tools log the shape of each call for the function logs
	jest.spyOn(console, "log").mockImplementation(() => {});

	it("introduces itself with its instructions", async () => {
		const { result } = await call("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "test", version: "1" },
		});
		expect(result.serverInfo.name).toBe("sf-pools");
		expect(result.instructions).toMatch(/Times and dates are Pacific/);
	});

	it("lists five read-only tools", async () => {
		const { result } = await call("tools/list");
		expect(result.tools.map((t: { name: string }) => t.name)).toEqual([
			"find_sessions", "get_pool", "list_closures", "list_pools", "list_program_categories",
		]);
		for (const t of result.tools) expect(t.annotations.readOnlyHint).toBe(true);
	});

	it("answers find_sessions as text and structured content", async () => {
		const { result } = await tool("find_sessions", { when: "now", at: "2026-10-09T12:15" });
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent.sessions.map((s: { poolId: string }) => s.poolId)).toEqual(["balboa"]);
		expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
		expect(result.structuredContent.quiet[0]).toMatchObject({ poolId: "rossi", next: { startTime: "2:00p" } });
	});

	it("wraps a list in results", async () => {
		const { result } = await tool("list_pools");
		expect(result.structuredContent.results.map((p: { poolId: string }) => p.poolId)).toEqual(["balboa", "rossi"]);
	});

	it("defaults list_closures to the two weeks from the moment asked", async () => {
		const { result } = await tool("list_closures", { at: "2026-10-09T09:00" });
		expect(result.structuredContent).toMatchObject({ from: "2026-10-09", to: "2026-10-22" });
	});

	it("returns a question it can't answer as an error the agent can read", async () => {
		const { result } = await tool("get_pool", { pool: "Sutro" });
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toMatch(/no pool matches "Sutro"; the pools are balboa/);
	});

	it("rejects input outside the schema", async () => {
		const { result, error } = await tool("find_sessions", { when: "later" });
		expect(error ?? result.isError).toBeTruthy();
	});
});

describe("sessionQueryFromParams", () => {
	it("reads the grid's names and comma lists", () => {
		expect(sessionQueryFromParams(new URLSearchParams("when=soon&program=lap,family&pools=balboa,mlk&dropIn=false&limit=5"))).toEqual({
			when: "soon",
			categories: ["lap", "family"],
			pools: ["balboa", "mlk"],
			dropInOnly: false,
			limit: 5,
		});
	});

	it("explains what it can't read", () => {
		expect(() => sessionQueryFromParams(new URLSearchParams("when=later"))).toThrow(/no window "later"/);
		expect(() => sessionQueryFromParams(new URLSearchParams("dropIn=yes"))).toThrow(/true or false/);
		expect(() => sessionQueryFromParams(new URLSearchParams("limit=lots"))).toThrow(/whole number/);
	});
});
