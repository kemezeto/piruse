import {
	BACKGROUND_CONTEXT,
	type Context,
	type JsonlSessionMetadata,
	type JsonlSessionRepo,
	type Session,
} from "../runtime/index.ts";

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
	const candidates = await listUsable(repo, options.cwd, usable, context);
	if (options.continueSession) {
		if (!candidates[0]) throw new Error(`No sessions for ${options.cwd}. Run once without --continue.`);
		return repo.open(candidates[0], context);
	}
	if (options.resumeLatest) {
		const session = await openFirstReadable(repo, candidates, context);
		if (session) return session;
	}
	return repo.create({ cwd: options.cwd }, context);
}

export async function openFirstReadable(
	repo: JsonlSessionRepo,
	candidates: JsonlSessionMetadata[],
	context: Context,
): Promise<Session<JsonlSessionMetadata> | undefined> {
	for (const metadata of candidates) {
		try {
			return await repo.open(metadata, context);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			console.warn(`Skipping unreadable session ${shortId(metadata.id)}: ${reason}`);
		}
	}
	return undefined;
}

async function listUsable(
	repo: JsonlSessionRepo,
	cwd: string,
	usable: (sessionId: string) => boolean,
	context: Context,
): Promise<JsonlSessionMetadata[]> {
	const listed = await repo.list({ cwd }, context);
	listed.sort((left, right) => right.modifiedAt - left.modifiedAt);
	return listed.filter((entry) => usable(entry.id));
}
