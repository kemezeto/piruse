import {
	BACKGROUND_CONTEXT,
	type Context,
	type JsonlSessionMetadata,
	type JsonlSessionRepo,
	type Session,
} from "@earendil-works/pi-agent-core";

export interface OpenSessionOptions {
	cwd: string;
	sessionId?: string;
	continueSession?: boolean;
	/** Latest unarchived session for cwd, or create if none. Web default. */
	resumeLatest?: boolean;
	usable?: (sessionId: string) => boolean;
}

export function shortId(id: string): string {
	return id.slice(0, 8);
}

export async function openInitialSession(
	repo: JsonlSessionRepo,
	options: OpenSessionOptions,
	context: Context = BACKGROUND_CONTEXT,
): Promise<Session<JsonlSessionMetadata>> {
	const usable = options.usable ?? (() => true);
	if (options.sessionId) {
		if (!usable(options.sessionId)) throw new Error(`Session is archived: ${options.sessionId}`);
		const metadata = (await repo.list(undefined, context)).find((candidate) => candidate.id === options.sessionId);
		if (!metadata) throw new Error(`Unknown session: ${options.sessionId}`);
		return repo.open(metadata, context);
	}
	const latest = await latestUsable(repo, options.cwd, usable, context);
	if (options.continueSession) {
		if (!latest) throw new Error(`No sessions for ${options.cwd}. Run once without --continue.`);
		return repo.open(latest, context);
	}
	if (options.resumeLatest && latest) return repo.open(latest, context);
	return repo.create({ cwd: options.cwd }, context);
}

async function latestUsable(
	repo: JsonlSessionRepo,
	cwd: string,
	usable: (sessionId: string) => boolean,
	context: Context,
): Promise<JsonlSessionMetadata | undefined> {
	const listed = await repo.list({ cwd }, context);
	listed.sort((left, right) => right.modifiedAt - left.modifiedAt);
	return listed.find((entry) => usable(entry.id));
}
