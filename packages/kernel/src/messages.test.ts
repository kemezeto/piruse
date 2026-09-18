import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { itemsFromMessage } from "./messages.ts";

function assistant(content: unknown, streaming = false) {
	return itemsFromMessage(
		"m1",
		{
			role: "assistant",
			content,
			api: "openai-completions",
			provider: "deepseek",
			model: "deepseek-v4-flash",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: "stop",
			timestamp: 1,
		} as AgentMessage,
		streaming,
	);
}

test("projects thinking blocks onto assistant items", () => {
	const [item] = assistant([
		{ type: "thinking", thinking: "先把题拆开" },
		{ type: "text", text: "答案是 2。" },
	]);
	assert.equal(item?.kind, "assistant");
	if (item?.kind !== "assistant") return;
	assert.equal(item.thinking, "先把题拆开");
	assert.equal(item.text, "答案是 2。");
	assert.equal(item.thinkingStreaming, false);
});

test("streams thinking before reply text", () => {
	const [item] = assistant([{ type: "thinking", thinking: "一步" }], true);
	assert.equal(item?.kind, "assistant");
	if (item?.kind !== "assistant") return;
	assert.equal(item.thinking, "一步");
	assert.equal(item.thinkingStreaming, true);
	assert.equal(item.text, "");
});

test("keeps thinking on the item after reply text starts", () => {
	const [item] = assistant(
		[
			{ type: "thinking", thinking: "先比十分位" },
			{ type: "text", text: "9.9 更大" },
		],
		true,
	);
	assert.equal(item?.kind, "assistant");
	if (item?.kind !== "assistant") return;
	assert.equal(item.thinking, "先比十分位");
	assert.equal(item.thinkingStreaming, false);
	assert.equal(item.streaming, true);
	assert.equal(item.text, "9.9 更大");
});
