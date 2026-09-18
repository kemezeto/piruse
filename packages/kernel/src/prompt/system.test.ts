import assert from "node:assert/strict";
import { test } from "node:test";
import { systemPromptForCwd } from "./system.ts";

test("system prompt includes live model and thinking level", () => {
	const prompt = systemPromptForCwd("/tmp/proj", {
		provider: "deepseek",
		modelId: "deepseek-v4-flash",
		thinkingLevel: "low",
	});
	assert.match(prompt, /Current model: deepseek\/deepseek-v4-flash/);
	assert.match(prompt, /Thinking level: low/);
	assert.match(prompt, /Never read credential files/);
});
