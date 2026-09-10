import { Operator, type BootedHarness, type BootOptions } from "./harness.ts";

export type { BootedHarness, BootOptions, Operator };

export async function bootHarness(options: BootOptions): Promise<Operator> {
	return Operator.boot(options);
}
