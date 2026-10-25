// The MCP server agents connect to: Streamable HTTP, stateless, read-only and
// open to anyone, since the schedules are public. The tools live in
// mcp-tools.ts; this only mounts them.
import { createMcpHandler } from "mcp-handler";
import { loadSwimAnswers } from "@/lib/agent-answers";
import { MCP_INSTRUCTIONS, registerSwimTools } from "@/lib/mcp-tools";

const handler = createMcpHandler((server) => registerSwimTools(server, loadSwimAnswers), {
	serverInfo: { name: "sf-pools", version: "1.0.0" },
	instructions: MCP_INSTRUCTIONS,
});

export { handler as GET, handler as POST, handler as DELETE };
