/** Directory names skipped by grep/glob fallback walks. */
export const SKIP_DIR_NAMES = new Set([
	".git",
	".hg",
	".svn",
	".piruse",
	".next",
	".turbo",
	".cache",
	"node_modules",
	"dist",
	"coverage",
]);

export function pathIsSkipped(relativePath: string): boolean {
	return relativePath.split(/[/\\]/).some((part) => SKIP_DIR_NAMES.has(part));
}
