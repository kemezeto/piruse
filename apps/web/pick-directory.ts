import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

const POWERSHELL_BROWSE = [
	"Add-Type -AssemblyName System.Windows.Forms",
	"$form = New-Object System.Windows.Forms.Form",
	"$form.TopMost = $true",
	"$form.ShowInTaskbar = $false",
	"$form.WindowState = 'Minimized'",
	"$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
	"$dialog.Description = 'Select project folder'",
	"$dialog.ShowNewFolderButton = $true",
	"$result = $dialog.ShowDialog($form)",
	"$form.Dispose()",
	"if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }",
	"[Console]::Out.Write($dialog.SelectedPath)",
].join("; ");

/** Native folder picker. Undefined means the user cancelled. */
export async function pickDirectory(): Promise<string | undefined> {
	const picked = await pickRaw();
	if (!picked) return undefined;
	return toHostPath(picked);
}

async function pickRaw(): Promise<string | undefined> {
	const backends: Array<() => Promise<string | undefined>> = [];
	if (process.platform === "darwin") {
		backends.push(pickMac);
	} else if (process.platform === "win32") {
		backends.push(() => pickWindows("powershell.exe"));
	} else {
		backends.push(pickZenity, pickKdialog, pickWslWindows);
	}

	let lastError: unknown;
	for (const backend of backends) {
		try {
			return await backend();
		} catch (error) {
			if (isCancelled(error)) return undefined;
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : new Error("当前环境无法打开系统文件夹选择器");
}

async function pickMac(): Promise<string | undefined> {
	return run("osascript", ["-e", 'POSIX path of (choose folder with prompt "Select project folder")']);
}

async function pickZenity(): Promise<string | undefined> {
	const bin = await which("zenity");
	if (!bin) throw new Error("zenity missing");
	return run(bin, ["--file-selection", "--directory", "--title=Select project folder"]);
}

async function pickKdialog(): Promise<string | undefined> {
	const bin = await which("kdialog");
	if (!bin) throw new Error("kdialog missing");
	return run(bin, ["--getexistingdirectory", homedir(), "Select project folder"]);
}

async function pickWslWindows(): Promise<string | undefined> {
	const powershell = await findWslPowerShell();
	if (!powershell) throw new Error("powershell missing");
	return pickWindows(powershell);
}

async function pickWindows(powershell: string): Promise<string | undefined> {
	return run(powershell, ["-NoProfile", "-Sta", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_BROWSE]);
}

async function run(command: string, args: string[]): Promise<string | undefined> {
	const { stdout } = await execFileAsync(command, args, {
		encoding: "utf8",
		windowsHide: false,
		maxBuffer: 1024 * 1024,
	});
	const value = stripBom(stdout).trim();
	return value || undefined;
}

async function toHostPath(picked: string): Promise<string> {
	const path = stripBom(picked).trim();
	if (!looksWindows(path)) return path;
	try {
		const { stdout } = await execFileAsync("wslpath", ["-u", path], { encoding: "utf8" });
		const converted = stripBom(stdout).trim();
		if (converted) return converted;
	} catch {
		/* fall through */
	}
	const drive = path.match(/^([A-Za-z]):[\\/](.*)$/);
	if (drive) return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`;
	return path.replace(/\\/g, "/");
}

function looksWindows(path: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function stripBom(value: string): string {
	return value.replace(/^\uFEFF/, "");
}

function isCancelled(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("code" in error)) return false;
	return error.code === 1;
}

async function which(name: string): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync("which", [name], { encoding: "utf8" });
		return stripBom(stdout).trim().split("\n")[0] || undefined;
	} catch {
		return undefined;
	}
}

async function findWslPowerShell(): Promise<string | undefined> {
	const fromPath = await which("powershell.exe");
	if (fromPath) return fromPath;
	for (const candidate of [
		"/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
		"/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe",
	]) {
		try {
			await access(candidate, fsConstants.X_OK);
			return candidate;
		} catch {
			/* try next */
		}
	}
	return undefined;
}
