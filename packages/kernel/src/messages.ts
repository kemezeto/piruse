import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ViewItem } from "../../protocol/src/view.ts";

export function itemsFromMessage(id: string, message: AgentMessage, streaming = false): ViewItem[] {
	if (message.role === "user") {
		return [{ id, kind: "user", text: userText(message.content) }];
	}
	if (message.role === "assistant") {
		const items: ViewItem[] = [];
		const text = message.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("");
		if (text || streaming) items.push({ id, kind: "assistant", text, streaming });
		return items;
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
