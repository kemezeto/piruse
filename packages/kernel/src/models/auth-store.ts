/**
 * File-backed CredentialStore in the same shape as pi-ai / coding-agent auth.json.
 * Stored credentials win over environment variables for that provider.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

type AuthFile = Record<string, Credential>;

function isCredential(value: unknown): value is Credential {
	if (!value || typeof value !== "object") return false;
	const type = (value as { type?: unknown }).type;
	return type === "api_key" || type === "oauth";
}

function parseAuthFile(raw: string): AuthFile {
	const parsed: unknown = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Invalid auth.json: expected an object");
	}
	const data: AuthFile = {};
	for (const [providerId, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (!isCredential(value)) throw new Error(`Invalid auth.json credential for provider "${providerId}"`);
		data[providerId] = value;
	}
	return data;
}

function expandApiKey(credential: Credential): Credential {
	if (credential.type !== "api_key" || credential.key === undefined) return credential;
	const key = credential.key;
	const match = /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(key) ?? /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(key);
	if (!match) return credential;
	const resolved = process.env[match[1]];
	return resolved === undefined ? credential : { ...credential, key: resolved };
}

export class FileCredentialStore implements CredentialStore {
	private snapshot: AuthFile | undefined;
	private loading: Promise<AuthFile> | undefined;
	private writes: Promise<unknown> = Promise.resolve();

	constructor(readonly path: string) {}

	static create(path: string): FileCredentialStore {
		return new FileCredentialStore(path);
	}

	private async readFile(): Promise<AuthFile> {
		try {
			return parseAuthFile(await readFile(this.path, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
			throw error;
		}
	}

	private load(): Promise<AuthFile> {
		if (this.snapshot) return Promise.resolve(this.snapshot);
		if (!this.loading) {
			this.loading = this.readFile().then((data) => {
				this.snapshot = data;
				return data;
			});
			void this.loading.finally(() => {
				this.loading = undefined;
			});
		}
		return this.loading;
	}

	private enqueueWrite<T>(task: () => Promise<T>, options?: AuthOperationOptions): Promise<T> {
		options?.signal?.throwIfAborted();
		const run = this.writes.then(task, task);
		this.writes = run.then(
			() => {},
			() => {},
		);
		return run;
	}

	private async save(data: AuthFile): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
		await writeFile(this.path, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		this.snapshot = data;
	}

	async read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
		options?.signal?.throwIfAborted();
		const credential = (await this.load())[providerId];
		return credential ? expandApiKey(credential) : undefined;
	}

	async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
		options?.signal?.throwIfAborted();
		return Object.entries(await this.load()).map(([providerId, credential]) => ({
			providerId,
			type: credential.type,
		}));
	}

	modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
		options?: AuthOperationOptions,
	): Promise<Credential | undefined> {
		return this.enqueueWrite(async () => {
			const data = { ...(await this.load()) };
			const next = await fn(data[providerId]);
			options?.signal?.throwIfAborted();
			if (next === undefined) return data[providerId];
			data[providerId] = next;
			await this.save(data);
			return next;
		}, options);
	}

	delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
		return this.enqueueWrite(async () => {
			const data = { ...(await this.load()) };
			if (!(providerId in data)) return;
			delete data[providerId];
			await this.save(data);
		}, options);
	}

	setApiKey(providerId: string, key: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
		const trimmed = key.trim();
		if (!trimmed) throw new Error("API key is empty");
		return this.modify(providerId, async () => ({ type: "api_key", key: trimmed }), options);
	}
}
