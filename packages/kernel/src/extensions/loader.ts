import * as piAgentCore from "@earendil-works/pi-agent-core";
import * as piAiCompat from "@earendil-works/pi-ai/compat";
import * as piAiOauth from "@earendil-works/pi-ai/oauth";
import * as piAiProviders from "@earendil-works/pi-ai/providers/all";
import { createJiti } from "jiti";
import * as typebox from "typebox";
import * as typeboxCompile from "typebox/compile";
import * as typeboxValue from "typebox/value";
import { defineTool } from "./types.ts";
import type { ExtensionFactory } from "./types.ts";

const codingAgentShim = {
	defineTool,
};

const tuiStub = new Proxy(
	{ __esModule: true },
	{
		get: (_target, prop) => {
			if (prop === "__esModule") return true;
			if (prop === "default") return tuiStub;
			return function tuiUnavailable() {
				return undefined;
			};
		},
	},
);

const VIRTUAL_MODULES: Record<string, unknown> = {
	typebox,
	"typebox/compile": typeboxCompile,
	"typebox/value": typeboxValue,
	"@sinclair/typebox": typebox,
	"@sinclair/typebox/compile": typeboxCompile,
	"@sinclair/typebox/value": typeboxValue,
	"@earendil-works/pi-agent-core": piAgentCore,
	"@earendil-works/pi-ai": piAiCompat,
	"@earendil-works/pi-ai/compat": piAiCompat,
	"@earendil-works/pi-ai/oauth": piAiOauth,
	"@earendil-works/pi-ai/providers/all": piAiProviders,
	"@earendil-works/pi-coding-agent": codingAgentShim,
	"@earendil-works/pi-tui": tuiStub,
	"@mariozechner/pi-agent-core": piAgentCore,
	"@mariozechner/pi-ai": piAiCompat,
	"@mariozechner/pi-ai/compat": piAiCompat,
	"@mariozechner/pi-ai/oauth": piAiOauth,
	"@mariozechner/pi-ai/providers/all": piAiProviders,
	"@mariozechner/pi-coding-agent": codingAgentShim,
	"@mariozechner/pi-tui": tuiStub,
};

export async function importExtensionFactory(extensionPath: string): Promise<ExtensionFactory> {
	const jiti = createJiti(import.meta.url, {
		moduleCache: false,
		virtualModules: VIRTUAL_MODULES,
	});
	const module = await jiti.import(extensionPath, { default: true });
	if (typeof module === "function") return module as ExtensionFactory;
	if (module && typeof module === "object" && "default" in module && typeof module.default === "function") {
		return module.default as ExtensionFactory;
	}
	throw new Error(`Extension does not export a factory function: ${extensionPath}`);
}
