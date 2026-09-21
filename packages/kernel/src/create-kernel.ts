import { Operator, type BootedHarness, type BootOptions, type RunHandlers, type ViewSubscription } from "./harness.ts";

export type { BootedHarness, BootOptions, Operator, RunHandlers, ViewSubscription };

export async function bootHarness(options: BootOptions): Promise<Operator> {
	return Operator.boot(options);
}
