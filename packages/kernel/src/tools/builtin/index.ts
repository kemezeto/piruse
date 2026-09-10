import { bashTool } from "./bash.ts";
import { editTool } from "./edit.ts";
import { globTool } from "./glob.ts";
import { grepTool } from "./grep.ts";
import { readTool } from "./read.ts";
import { writeTool } from "./write.ts";

/** Register a tool by adding its file and one line here. */
export function builtinTools() {
	return [readTool(), writeTool(), editTool(), bashTool(), grepTool(), globTool()];
}
