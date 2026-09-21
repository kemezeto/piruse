import { DEFAULT_COMPACTION_SETTINGS, type CompactionSettings } from "../runtime/index.ts";

export type { CompactionSettings };

/** Thresholds passed into AgentHarness. Cut-point and summary stay in pi. */
export const compactionSettings: CompactionSettings = DEFAULT_COMPACTION_SETTINGS;
