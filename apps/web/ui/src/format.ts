export function relativeTime(ms: number, now = Date.now()): string {
	const delta = Math.max(0, now - ms);
	const seconds = Math.floor(delta / 1000);
	if (seconds < 5) return "刚刚";
	if (seconds < 60) return `${seconds}秒前`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}小时前`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}天前`;
	return new Date(ms).toLocaleDateString("zh-CN");
}

export function basenameOf(cwd: string): string {
	const parts = cwd.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? cwd;
}
