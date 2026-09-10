export function toolText(text: string, isError = false) {
	return {
		content: [{ type: "text" as const, text }],
		details: undefined,
		...(isError ? { isError: true as const } : {}),
	};
}
