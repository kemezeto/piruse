import type { ViewPackageItem, ViewPackageStatus } from "../../../protocol/src/view.ts";
import type { InstalledResource, InstalledResources } from "./inventory.ts";

export function toViewItem(resource: InstalledResource): ViewPackageItem {
	return {
		id: resource.id,
		name: resource.name,
		description: resource.description,
		source: resource.source,
		path: resource.path,
		enabled: resource.enabled,
	};
}

export function packageStatus(
	inventory: InstalledResources,
	extras: { diagnostics: { level: "error" | "warning"; message: string; path?: string }[]; unsupported: string[] },
): ViewPackageStatus {
	return {
		skills: inventory.skills.map(toViewItem),
		extensions: inventory.extensions.map(toViewItem),
		diagnostics: extras.diagnostics.map((item) => ({
			level: item.level,
			message: item.path ? `${item.message} (${item.path})` : item.message,
		})),
		unsupported: extras.unsupported,
	};
}
