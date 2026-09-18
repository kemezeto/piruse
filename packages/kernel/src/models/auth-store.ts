/**
 * File-backed CredentialStore in the same shape as pi-ai / coding-agent auth.json.
 * Secrets are AES-GCM sealed on disk (`piruse:v1:…`). Stored credentials still
 * win over environment variables for that provider.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import {
	defaultMasterKeyPath,
	isEncryptedSecret,
	isEnvKeyRef,
	loadMasterKey,
	openString,
	sealString,
} from "./secret.ts";

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
	if (!isEnvKeyRef(key)) return credential;
	const name = key.startsWith("${") ? key.slice(2, -1) : key.slice(1);
	const resolved = process.env[name];
	return resolved === undefined ? credential : { ...credential, key: resolved };
}

function sealCredential(credential: Credential, key: Buffer): Credential {
	if (credential.type === "api_key") {
		const sealed = sealString(credential.key, key);
		return sealed === credential.key ? credential : { ...credential, key: sealed };
	}
	const access = sealString(credential.access, key) ?? credential.access;
	const refresh = sealString(credential.refresh, key) ?? credential.refresh;
	if (access === credential.access && refresh === credential.refresh) return credential;
	return { ...credential, access, refresh };
}

function openCredential(credential: Credential, key: Buffer): Credential {
	if (credential.type === "api_key") {
		const opened = openString(credential.key, key);
		return opened === credential.key ? credential : { ...credential, key: opened };
	}
	return {
		...credential,
		access: openString(credential.access, key) ?? credential.access,
		refresh: openString(credential.refresh, key) ?? credential.refresh,
	};
}

function needsSeal(credential: Credential): boolean {
	if (credential.type === "api_key") {
		return Boolean(credential.key && !isEncryptedSecret(credential.key) && !isEnvKeyRef(credential.key));
	}
	return (
		(Boolean(credential.access) && !isEncryptedSecret(credential.access) && !isEnvKeyRef(credential.access)) ||
		(Boolean(credential.refresh) && !isEncryptedSecret(credential.refresh) && !isEnvKeyRef(credential.refresh))
	);
}

export class FileCredentialStore implements CredentialStore {
	private snapshot: AuthFile | undefined;
	private loading: Promise<AuthFile> | undefined;
	private writes: Promise<unknown> = Promise.resolve();
	private master: Buffer | undefined;

	readonly path: string;
	readonly keyPath: string;

	constructor(path: string, keyPath = defaultMasterKeyPath()) {
		this.path = path;
		this.keyPath = keyPath;
	}

	static create(path: string, keyPath?: string): FileCredentialStore {
		return new FileCredentialStore(path, keyPath ?? defaultMasterKeyPath());
	}

	private async key(): Promise<Buffer> {
		if (!this.master) this.master = await loadMasterKey(this.keyPath);
		return this.master;
	}

	private async readDisk(): Promise<AuthFile> {
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
			this.loading = this.readDisk().then(async (data) => {
				const key = await this.key();
				let dirty = false;
				const next: AuthFile = {};
				for (const [id, credential] of Object.entries(data)) {
					if (needsSeal(credential)) {
						next[id] = sealCredential(credential, key);
						dirty = true;
					} else {
						next[id] = credential;
					}
				}
				if (dirty) await this.save(next);
				else this.snapshot = next;
				return next;
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
		if (!credential) return undefined;
		return expandApiKey(openCredential(credential, await this.key()));
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
			const key = await this.key();
			const data = { ...(await this.load()) };
			const current = data[providerId] ? openCredential(data[providerId], key) : undefined;
			const next = await fn(current);
			options?.signal?.throwIfAborted();
			if (next === undefined) return current;
			data[providerId] = sealCredential(next, key);
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
