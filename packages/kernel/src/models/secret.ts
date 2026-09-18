/**
 * AES-256-GCM for API keys at rest. The master key lives in ~/.piruse, not
 * next to ~/.pi/agent/auth.json.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const SECRET_PREFIX = "piruse:v1:";

export function defaultMasterKeyPath(): string {
	return join(homedir(), ".piruse", "master.key");
}

export function isEncryptedSecret(value: string): boolean {
	return value.startsWith(SECRET_PREFIX);
}

export function isEnvKeyRef(value: string): boolean {
	return /^\$([A-Za-z_][A-Za-z0-9_]*)$/.test(value) || /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.test(value);
}

export async function loadMasterKey(path = defaultMasterKeyPath()): Promise<Buffer> {
	try {
		const raw = await readFile(path);
		if (raw.length === 32) return raw;
		const hex = raw.toString("utf8").trim();
		if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
		throw new Error(`Invalid master key file: ${path}`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const key = randomBytes(32);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await writeFile(path, key, { mode: 0o600 });
	return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${SECRET_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function decryptSecret(value: string, key: Buffer): string {
	if (!isEncryptedSecret(value)) return value;
	const raw = Buffer.from(value.slice(SECRET_PREFIX.length), "base64url");
	if (raw.length < 29) throw new Error("Invalid encrypted secret");
	const iv = raw.subarray(0, 12);
	const tag = raw.subarray(12, 28);
	const data = raw.subarray(28);
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function sealString(value: string | undefined, key: Buffer): string | undefined {
	if (value === undefined || value === "" || isEncryptedSecret(value) || isEnvKeyRef(value)) return value;
	return encryptSecret(value, key);
}

export function openString(value: string | undefined, key: Buffer): string | undefined {
	if (value === undefined || !isEncryptedSecret(value)) return value;
	return decryptSecret(value, key);
}
