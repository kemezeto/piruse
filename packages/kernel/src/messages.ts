import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ViewItem } from "../../protocol/src/view.ts";

export function itemsFromMessage(id: string, message: AgentMessage, streaming = false): ViewItem[] {
	if (message.role === "user") {
		return [{ id, kind: "user", text: userText(message.content), at: message.timestamp }];
	}
	if (message.role === "assistant") {
		const thinking = message.content
			.filter((block): block is Extract<(typeof message.content)[number], { type: "thinking" }> => block.type === "thinking")
			.map((block) => (block.redacted ? "（思考已隐藏）" : block.thinking))
			.filter((part) => part.trim().length > 0)
			.join("\n\n")
			.trim();
		const text = message.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("");
		const hasThinkingBlock = message.content.some((block) => block.type === "thinking");
		if (!text && !thinking && !streaming) return [];
		return [
			{
				id,
				kind: "assistant",
				text,
				thinking: thinking || (hasThinkingBlock && streaming ? "" : undefined),
				thinkingStreaming: Boolean(streaming && hasThinkingBlock && !text),
				streaming,
				at: message.timestamp,
				tokens: message.usage?.totalTokens,
			},
		];
	}
	if (message.role === "toolResult") {
		return [
			{
				id,
				kind: "tool",
				name: message.toolName,
				args: "",
				result: textOfContent(message.content),
				running: false,
				isError: message.isError,
				at: message.timestamp,
			},
		];
	}
	return [];
}

export function formatArgs(args: unknown): string {
	if (args && typeof args === "object") {
		const record = args as Record<string, unknown>;
		if (typeof record.command === "string") return record.command;
		if (typeof record.path === "string") return record.path;
	}
	try {
		return JSON.stringify(args);
	} catch {
		return String(args);
	}
}

export function userText(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") return content;
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("");
}

export function textOfContent(content: Array<{ type: string; text?: string }>): string {
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("");
}
