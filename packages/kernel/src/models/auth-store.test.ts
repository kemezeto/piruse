import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FileCredentialStore } from "./auth-store.ts";
import { decryptSecret, encryptSecret, isEncryptedSecret, loadMasterKey } from "./secret.ts";

test("encryptSecret round-trips", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piruse-secret-"));
	const key = await loadMasterKey(join(dir, "master.key"));
	const sealed = encryptSecret("sk-test-plain", key);
	assert.equal(isEncryptedSecret(sealed), true);
	assert.equal(decryptSecret(sealed, key), "sk-test-plain");
});

test("FileCredentialStore migrates plaintext keys on disk", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piruse-auth-"));
	const authPath = join(dir, "auth.json");
	const keyPath = join(dir, "master.key");
	await writeFile(authPath, `${JSON.stringify({ deepseek: { type: "api_key", key: "sk-plain" } }, null, 2)}\n`);
	const store = FileCredentialStore.create(authPath, keyPath);
	const credential = await store.read("deepseek");
	assert.equal(credential?.type, "api_key");
	assert.equal(credential?.type === "api_key" ? credential.key : undefined, "sk-plain");
	const disk = JSON.parse(await readFile(authPath, "utf8")) as { deepseek: { key: string } };
	assert.equal(isEncryptedSecret(disk.deepseek.key), true);
	assert.equal(disk.deepseek.key.includes("sk-plain"), false);
});

test("FileCredentialStore leaves env refs in plaintext", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piruse-auth-"));
	const authPath = join(dir, "auth.json");
	const keyPath = join(dir, "master.key");
	await writeFile(authPath, `${JSON.stringify({ deepseek: { type: "api_key", key: "$DEEPSEEK_API_KEY" } }, null, 2)}\n`);
	const store = FileCredentialStore.create(authPath, keyPath);
	process.env.DEEPSEEK_API_KEY = "from-env";
	try {
		const credential = await store.read("deepseek");
		assert.equal(credential?.type === "api_key" ? credential.key : undefined, "from-env");
		const disk = JSON.parse(await readFile(authPath, "utf8")) as { deepseek: { key: string } };
		assert.equal(disk.deepseek.key, "$DEEPSEEK_API_KEY");
	} finally {
		delete process.env.DEEPSEEK_API_KEY;
	}
});
