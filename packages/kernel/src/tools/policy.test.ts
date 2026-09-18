import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { emptyGrants, grantsAllow, inspectToolCall } from "./policy.ts";
import { commandPrefix, pathScope, prefixMatches, redirectTargets } from "./scope.ts";

const cwd = "/tmp/piruse-project";

test("allow mode still asks for writes outside the workspace", () => {
	const verdict = inspectToolCall("allow", "write", { path: "/tmp/elsewhere/secret.txt" }, cwd);
	assert.equal(verdict.reason, "outside");
	assert.deepEqual(verdict.remember, ["path"]);
});

test("allow mode still asks for protected workspace files", () => {
	assert.equal(inspectToolCall("allow", "write", { path: ".env" }, cwd).reason, "protected");
	assert.equal(inspectToolCall("allow", "edit", { path: join(cwd, ".git/config") }, cwd).reason, "protected");
	assert.equal(inspectToolCall("allow", "write", { path: join(homedir(), ".bashrc") }, cwd).reason, "protected");
});

test("allow mode runs ordinary workspace edits", () => {
	assert.equal(inspectToolCall("allow", "write", { path: "src/app.ts" }, cwd).reason, null);
});

test("review mode asks for workspace edits and offers a session grant", () => {
	const verdict = inspectToolCall("review", "edit", { path: "src/app.ts" }, cwd);
	assert.equal(verdict.reason, "mutate");
	assert.deepEqual(verdict.remember, ["session"]);
});

test("dangerous bash asks even in allow mode and cannot be remembered", () => {
	const verdict = inspectToolCall("allow", "bash", { command: "rm -rf src" }, cwd);
	assert.equal(verdict.reason, "dangerous");
	assert.deepEqual(verdict.remember, []);
});

test("bash redirect into .env is protected", () => {
	assert.equal(inspectToolCall("allow", "bash", { command: "echo hi > .env" }, cwd).reason, "protected");
	assert.deepEqual(redirectTargets("echo hi > ~/.bashrc"), ["~/.bashrc"]);
});

test("bash prefix matching ignores read-only prefixes in compounds", () => {
	assert.equal(commandPrefix("timeout 30 npm test --watch"), "npm test");
	assert.equal(prefixMatches("ls && npm test --watch", ["npm test"]), true);
	assert.equal(prefixMatches("npm test && rm -rf .", ["npm test"]), false);
});

test("session mutate grant skips later workspace writes but not .env", () => {
	const grants = emptyGrants();
	grants.classes.add("mutate");
	assert.equal(grantsAllow(inspectToolCall("review", "write", { path: "src/a.ts" }, cwd), grants), true);
	assert.equal(grantsAllow(inspectToolCall("review", "write", { path: ".env" }, cwd), grants), false);
});

test("remembered prefixes skip matching bash in review", () => {
	const grants = emptyGrants(["npm test"]);
	assert.equal(grantsAllow(inspectToolCall("review", "bash", { command: "npm test --run" }, cwd), grants), true);
	assert.equal(grantsAllow(inspectToolCall("review", "bash", { command: "npm install" }, cwd), grants), false);
});

test("pathScope treats .ssh as protected", () => {
	assert.equal(pathScope(cwd, join(homedir(), ".ssh/id_ed25519")), "protected");
	assert.equal(pathScope(cwd, join(cwd, "src/main.ts")), "workspace");
	assert.equal(pathScope(cwd, "/var/tmp/out.txt"), "outside");
});
