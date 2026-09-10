import { bashTool } from "./bash.ts";
import { editTool } from "./edit.ts";
import { readTool } from "./read.ts";
import { writeTool } from "./write.ts";

/** Register a tool by adding its file and one line here (grep, glob, …). */
export function builtinTools() {
	return [readTool(), writeTool(), editTool(), bashTool()];
}
