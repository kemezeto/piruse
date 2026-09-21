# Runtime wall.

The loop stays in pi (`AgentHarness`). piruse calls it only from this directory.

- `pi.ts` is the only file that imports `@earendil-works/pi-agent-core`
- `engine.ts` creates the execution env, jsonl repo, and harness
- `watch.ts` turns lane events into `ViewState` / CLI run callbacks

Apps and the rest of kernel import `runtime/`, never the npm package.
Change reason: execution engine (run, resume, abort), not session storage.
