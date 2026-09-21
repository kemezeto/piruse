import assert from "node:assert/strict";
import { test } from "node:test";
import { hourShanghai, parseSessionJsonl, ymdShanghai } from "./analyse.ts";

const at = Date.parse("2026-09-18T14:45:00+08:00");

function file(id = "sess-1") {
	return {
		id,
		cwd: "/home/itby/agent-learn/piruse",
		path: "/tmp/sess.jsonl",
		modifiedAt: at,
	};
}

test("shanghai day and hour follow Asia/Shanghai", () => {
	assert.equal(ymdShanghai(at), "2026-09-18");
	assert.equal(hourShanghai(at), 14);
});

test("parses messages, usage ledger, tools, compaction and abort", () => {
	const jsonl = [
		JSON.stringify({ v: 4, kind: "header", id: "sess-1", storageVersion: 1, createdAt: at, cwd: "/home/itby/agent-learn/piruse" }),
		JSON.stringify({
			kind: "value",
			op: "set",
			seq: 1,
			namespace: "pi.lane.config",
			key: "main",
			value: { model: { provider: "deepseek", modelId: "deepseek-v4-flash" } },
		}),
		JSON.stringify({
			kind: "value",
			op: "set",
			seq: 2,
			namespace: "pi.session.name",
			key: "",
			value: "分析项目结构",
		}),
		JSON.stringify({
			kind: "list",
			op: "append",
			seq: 3,
			namespace: "pi.pending.assistant_frame",
			value: { type: "thinking_delta", delta: "skip me" },
		}),
		JSON.stringify([
			{
				kind: "entry",
				id: "u1",
				type: "message",
				timestamp: at,
				message: { role: "user", content: [{ type: "text", text: "看看这个仓库" }], timestamp: at },
			},
		]),
		JSON.stringify([
			{
				kind: "entry",
				id: "a1",
				type: "message",
				timestamp: at + 1000,
				message: {
					role: "assistant",
					provider: "deepseek",
					model: "deepseek-v4-flash",
					stopReason: "toolUse",
					timestamp: at + 1000,
					content: [{ type: "toolCall", id: "c1", name: "bash" }],
					usage: {
						input: 10,
						output: 20,
						cacheRead: 5,
						cacheWrite: 0,
						totalTokens: 35,
						cost: { total: 0.001 },
					},
				},
			},
			{
				kind: "usage",
				id: "usage-1",
				usage: { input: 10, output: 20, cacheRead: 5, cacheWrite: 0, totalTokens: 35, cost: { total: 0.001 } },
				entryId: "a1",
				adjustment: false,
			},
		]),
		JSON.stringify({
			kind: "entry",
			id: "t1",
			type: "message",
			timestamp: at + 2000,
			message: {
				role: "toolResult",
				toolCallId: "c1",
				toolName: "bash",
				isError: true,
				content: [{ type: "text", text: "boom" }],
				timestamp: at + 2000,
			},
		}),
		JSON.stringify({
			kind: "entry",
			id: "cmp",
			type: "compaction",
			timestamp: at + 3000,
			summary: "short",
		}),
		JSON.stringify({
			kind: "value",
			op: "set",
			seq: 9,
			namespace: "pi.result",
			key: "op1",
			value: { status: "aborted", startedAt: at, endedAt: at + 4000 },
		}),
	].join("\n");

	const session = parseSessionJsonl(jsonl, file());
	assert.equal(session.title, "分析项目结构");
	assert.equal(session.project, "piruse");
	assert.equal(session.model, "deepseek/deepseek-v4-flash");
	assert.equal(session.userMessages, 1);
	assert.equal(session.assistantMessages, 1);
	assert.equal(session.messages, 2);
	assert.equal(session.usage.output, 20);
	assert.equal(session.usage.input, 10);
	assert.equal(session.usage.cacheRead, 5);
	assert.equal(session.usage.cost, 0.001);
	assert.equal(session.toolCalls, 1);
	assert.equal(session.toolErrors, 1);
	assert.equal(session.tools[0]?.name, "bash");
	assert.equal(session.compaction, 1);
	assert.equal(session.aborted, true);
	assert.equal(session.days.length, 1);
	assert.equal(session.days[0]?.date, "2026-09-18");
	assert.equal(session.days[0]?.messages, 2);
	assert.equal(session.days[0]?.tokens, 20);
	assert.equal(session.days[0]?.tools, 1);
	assert.equal(session.days[0]?.hours[14], 2);
});

test("falls back to assistant usage when the ledger has no rows", () => {
	const jsonl = JSON.stringify({
		kind: "entry",
		id: "a1",
		type: "message",
		timestamp: at,
		message: {
			role: "assistant",
			content: [{ type: "text", text: "hi" }],
			timestamp: at,
			usage: { input: 2, output: 8, cacheRead: 0, cost: { total: 0.2 } },
		},
	});
	const session = parseSessionJsonl(jsonl, file("legacy"));
	assert.equal(session.usage.output, 8);
	assert.equal(session.usage.cost, 0.2);
	assert.equal(session.days[0]?.tokens, 8);
});

test("skips torn lines and uses the first user prompt as title", () => {
	const jsonl = ["{not json", JSON.stringify({
		kind: "entry",
		id: "u1",
		type: "message",
		timestamp: at,
		message: { role: "user", content: "写一份 README", timestamp: at },
	})].join("\n");
	const session = parseSessionJsonl(jsonl, file("untitled"));
	assert.equal(session.title, "写一份 README");
});
