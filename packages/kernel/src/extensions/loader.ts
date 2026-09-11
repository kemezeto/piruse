import * as piAgentCore from "@earendil-works/pi-agent-core";
import * as piAiCompat from "@earendil-works/pi-ai/compat";
import * as piAiOauth from "@earendil-works/pi-ai/oauth";
import * as piAiProviders from "@earendil-works/pi-ai/providers/all";
import { createJiti } from "jiti/static";
import * as typebox from "typebox";
import * as typeboxCompile from "typebox/compile";
import * as typeboxValue from "typebox/value";
import { codingAgentShim, tuiShim } from "./shims.ts";
import type { ExtensionFactory } from "./types.ts";

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
	"@earendil-works/pi-tui": tuiShim,
	"@mariozechner/pi-agent-core": piAgentCore,
	"@mariozechner/pi-ai": piAiCompat,
	"@mariozechner/pi-ai/compat": piAiCompat,
	"@mariozechner/pi-ai/oauth": piAiOauth,
	"@mariozechner/pi-ai/providers/all": piAiProviders,
	"@mariozechner/pi-coding-agent": codingAgentShim,
	"@mariozechner/pi-tui": tuiShim,
};

type ExtensionJiti = ReturnType<typeof createJiti>;

let sharedJiti: ExtensionJiti | undefined;

export function getExtensionJiti(): ExtensionJiti {
	sharedJiti ??= createJiti(import.meta.url, {
		moduleCache: true,
		tryNative: false,
		virtualModules: VIRTUAL_MODULES,
	});
	return sharedJiti;
}

export async function importExtensionFactory(extensionPath: string): Promise<ExtensionFactory> {
	const module = await withTimeout(
		getExtensionJiti().import(extensionPath, { default: true }),
		20_000,
		`Extension import timed out: ${extensionPath}`,
	);
	if (typeof module === "function") return module as ExtensionFactory;
	if (module && typeof module === "object" && "default" in module && typeof (module as { default: unknown }).default === "function") {
		return (module as { default: ExtensionFactory }).default;
	}
	throw new Error(`Extension does not export a factory function: ${extensionPath}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}
