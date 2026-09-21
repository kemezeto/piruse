/**
 * Local operator window. Binds 127.0.0.1 only. The browser never sees the harness.
 * Model keys come from ~/.pi/agent/auth.json (same file as pi), then provider env vars.
 * Missing keys still start the window so they can be added in Settings.
 *
 *   npm run web                          # resume latest unarchived chat for this project
 *   npm run web -- --cwd ~/code/other
 *   npm run web -- --session <id>
 *   npm run web -- --model deepseek/deepseek-v4-flash
 */

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, type WebSocket } from "ws";
import { pickDirectory } from "./pick-directory.ts";
import { parseArgs } from "../flags.ts";
import { bootHarness, type Operator, type ViewSubscription } from "../../packages/kernel/src/create-kernel.ts";
import { resolveBootCwd, writeLastProject } from "../../packages/kernel/src/session/projects.ts";
import type { ClientMessage, SocketPayload, ViewMeta } from "../../packages/protocol/src/index.ts";

interface Client {
	socket: WebSocket;
	sub?: ViewSubscription;
}

const args = parseArgs(process.argv.slice(2));
const cwd = await resolveBootCwd({
	explicit: args.cwd,
	sessionsRoot: args.sessionsRoot,
	fallback: process.cwd(),
});
const operator: Operator = await bootHarness({
	cwd,
	sessionsRoot: args.sessionsRoot,
	sessionId: args.sessionId,
	continueSession: args.continueSession,
	resumeLatest: true,
	provider: args.provider,
	model: args.model,
	agentDir: args.agentDir,
	permissionMode: args.permission,
	interactiveApprovals: true,
});
await writeLastProject(args.sessionsRoot, operator.cwd).catch(() => {});

let meta: ViewMeta = await loadMeta(operator);
const clients = new Set<Client>();
let queue: Promise<void> = Promise.resolve();
let generation = 0;

operator.onPermissionChange(() => {
	meta = {
		...meta,
		permissionMode: operator.permissionMode(),
		pendingApprovals: operator.pendingApprovals(),
	};
	for (const client of clients) {
		if (client.sub && client.socket.readyState === client.socket.OPEN) {
			send(client.socket, { type: "state", state: client.sub.view(meta) });
		}
	}
});

function run(task: () => Promise<void>): Promise<void> {
	const next = queue.then(task, task);
	queue = next.then(
		() => {},
		() => {},
	);
	return next;
}

async function loadMeta(current: Operator): Promise<ViewMeta> {
	const [models, catalog, sessions, archivedSessions, projects, sessionTitle] = await Promise.all([
		current.listModels(),
		current.listCatalog(),
		current.listSessions(),
		current.listArchivedSessions(),
		current.listProjects(),
		current.sessionTitle(),
	]);
	return {
		sessionId: current.sessionId,
		cwd: current.cwd,
		sessionPath: current.sessionPath,
		sessionTitle,
		models,
		providers: catalog.providers,
		providerChoices: catalog.choices,
		projects,
		sessions,
		archivedSessions,
		permissionMode: current.permissionMode(),
		pendingApprovals: current.pendingApprovals(),
		packages: current.packageStatus(),
		model: current.model ? { provider: current.model.provider, modelId: current.model.id } : null,
		thinkingLevel: current.thinkingLevel,
	};
}

function send(socket: WebSocket, payload: SocketPayload): void {
	if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(): void {
	for (const client of clients) {
		if (client.sub && client.socket.readyState === client.socket.OPEN) {
			send(client.socket, { type: "state", state: client.sub.view(meta) });
		}
	}
}

function notice(socket: WebSocket, error: unknown): void {
	send(socket, { type: "notice", text: error instanceof Error ? error.message : String(error) });
}

async function attach(client: Client): Promise<void> {
	const gen = generation;
	const sub = await operator.subscribeView(
		() => meta,
		(state) => {
			if (generation !== gen) return;
			if (client.socket.readyState === client.socket.OPEN) {
				send(client.socket, { type: "state", state });
			}
		},
	);
	if (generation !== gen || !clients.has(client) || client.socket.readyState !== client.socket.OPEN) {
		sub.unsubscribe();
		return;
	}
	client.sub = sub;
	send(client.socket, { type: "state", state: sub.view(meta) });
}

function dropWatches(): void {
	generation += 1;
	for (const client of clients) {
		client.sub?.unsubscribe();
		client.sub = undefined;
	}
}

async function rebind(): Promise<void> {
	meta = await loadMeta(operator);
	for (const client of clients) {
		if (client.socket.readyState === client.socket.OPEN) await attach(client);
	}
}

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (socket) => {
	const client: Client = { socket };
	clients.add(client);
	void attach(client).catch((error: unknown) => notice(socket, error));

	socket.on("message", (raw) => {
		let message: ClientMessage;
		try {
			message = JSON.parse(String(raw)) as ClientMessage;
		} catch {
			notice(socket, "Invalid message");
			return;
		}
		void (async () => {
			try {
				if (message.type === "approveTool" && message.id) {
					operator.resolveApproval(message.id, true, message.remember);
					return;
				}
				if (message.type === "denyTool" && message.id) {
					operator.resolveApproval(message.id, false);
					return;
				}
				if (message.type === "loadAnalyse") {
					send(socket, { type: "analyse", snapshot: await operator.listAnalyse() });
					return;
				}
				if (message.type === "abort") {
					operator.rejectApprovals();
					await operator.abort();
					meta = await loadMeta(operator);
					broadcast();
					return;
				}
				if (message.type === "setPermissionMode" && message.mode) {
					await operator.setPermissionMode(message.mode);
					meta = await loadMeta(operator);
					return;
				}
				await run(async () => {
					if (message.type === "prompt" && message.text?.trim()) {
						await operator.rememberTitleFromPrompt(message.text.trim());
						meta = await loadMeta(operator);
						broadcast();
						await operator.prompt(message.text.trim());
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "setSessionTitle" && message.title?.trim()) {
						await operator.setSessionTitle(message.sessionId, message.title);
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "setModel" && message.provider && message.modelId) {
						dropWatches();
						try {
							await operator.setModel(message.provider, message.modelId);
						} finally {
							await rebind();
						}
					} else if (message.type === "setThinkingLevel" && message.level) {
						await operator.setThinkingLevel(message.level);
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "openSession" && message.sessionId) {
						dropWatches();
						try {
							await operator.openSession(message.sessionId);
						} finally {
							await rebind();
						}
					} else if (message.type === "newSession") {
						dropWatches();
						try {
							await operator.newSession();
						} finally {
							await rebind();
						}
					} else if (message.type === "pickProject") {
						const cwd = await pickDirectory();
						if (!cwd) return;
						dropWatches();
						try {
							await operator.openProject(cwd);
						} finally {
							await rebind();
						}
					} else if (message.type === "openProject" && message.cwd?.trim()) {
						dropWatches();
						try {
							await operator.openProject(message.cwd.trim());
						} finally {
							await rebind();
						}
					} else if (message.type === "archiveSession") {
						const target = message.sessionId?.trim() || operator.sessionId;
						const switching = target === operator.sessionId;
						if (switching) dropWatches();
						try {
							await operator.archiveSession(message.sessionId);
						} finally {
							if (switching) await rebind();
							else {
								meta = await loadMeta(operator);
								broadcast();
							}
						}
					} else if (message.type === "unarchiveSession" && message.sessionId) {
						await operator.unarchiveSession(message.sessionId);
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "deleteArchivedSession" && message.sessionId) {
						await operator.deleteArchivedSession(message.sessionId);
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "addProvider" && message.id && message.baseUrl && message.api && message.apiKey) {
						await operator.addProvider({
							id: message.id,
							name: message.name,
							baseUrl: message.baseUrl,
							api: message.api,
							apiKey: message.apiKey,
						});
						dropWatches();
						await rebind();
					} else if (message.type === "addModel" && message.provider && message.modelId) {
						await operator.addModel({
							provider: message.provider,
							modelId: message.modelId,
							name: message.name,
							reasoning: message.reasoning,
							contextWindow: message.contextWindow,
							maxTokens: message.maxTokens,
						});
						dropWatches();
						await rebind();
					} else if (message.type === "setProviderKey" && message.provider && message.apiKey) {
						await operator.setProviderKey(message.provider, message.apiKey);
						dropWatches();
						await rebind();
					} else if (message.type === "applyModelSetup" && message.provider && message.modelId) {
						dropWatches();
						try {
							await operator.applyModelSetup({
								provider: message.provider,
								name: message.name,
								baseUrl: message.baseUrl,
								api: message.api,
								apiKey: message.apiKey,
								modelId: message.modelId,
								modelName: message.modelName,
								reasoning: message.reasoning,
								contextWindow: message.contextWindow,
								maxTokens: message.maxTokens,
							});
						} finally {
							await rebind();
						}
					} else if (message.type === "deleteProvider" && message.id) {
						await operator.deleteProvider(message.id);
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "deleteProviderKey" && message.provider) {
						await operator.deleteProviderKey(message.provider);
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "deleteModel" && message.provider && message.modelId) {
						await operator.deleteModel(message.provider, message.modelId);
						meta = await loadMeta(operator);
						broadcast();
					} else if (message.type === "setSkillEnabled" && message.id && typeof message.enabled === "boolean") {
						dropWatches();
						try {
							await operator.setSkillEnabled(message.id, message.enabled);
						} finally {
							await rebind();
						}
					} else if (message.type === "setExtensionEnabled" && message.id && typeof message.enabled === "boolean") {
						dropWatches();
						try {
							await operator.setExtensionEnabled(message.id, message.enabled);
						} finally {
							await rebind();
						}
					}
				});
			} catch (error: unknown) {
				notice(socket, error);
			}
		})();
	});
	socket.on("close", () => {
		client.sub?.unsubscribe();
		clients.delete(client);
	});
});

const server = createServer();
const vite = await createViteServer({
	configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
	server: {
		middlewareMode: true,
		hmr: { server },
		allowedHosts: true,
	},
	appType: "spa",
});
server.on("request", (request, response) => {
	vite.middlewares(request, response, () => {
		response.writeHead(404).end("Not found");
	});
});
server.on("upgrade", (request, socket, head) => {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	if (url.pathname !== "/ws") return;
	wss.handleUpgrade(request, socket, head, (websocket) => wss.emit("connection", websocket, request));
});

server.listen(args.port, "127.0.0.1", () => {
	const url = `http://127.0.0.1:${args.port}`;
	console.error(`session ${operator.sessionId}`);
	console.error(`path    ${operator.sessionPath}`);
	console.error(`cwd     ${operator.cwd}`);
	console.error(`perm    ${operator.permissionMode()}`);
	if (operator.model) console.error(`model   ${operator.model.provider}/${operator.model.id}`);
	else console.error("model   unconfigured");
	if (operator.authSource) console.error(`auth    ${operator.authSource}`);
	if (operator.resumeLabels.length > 0) {
		console.error(`resume  ${operator.resumeLabels.join(", ")}`);
	}
	console.error(`window  ${url}`);
	if (args.openBrowser) openBrowser(url);
	void operator.resumeOpen().catch((error: unknown) => {
		console.error(error);
	});
});

function openBrowser(url: string): void {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const argv = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	execFile(command, argv, () => {});
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void (async () => {
			server.close();
			wss.close();
			await vite.close();
			await operator.close();
			process.exit(0);
		})();
	});
}
