import type {
	PluginAssetDeleteResult,
	PluginDownloadRequest,
	PluginDownloadResult,
} from "@hoardodile/sdk-types"
import { isRecord } from "@hoardodile/sdk-web"
import { LIVE2D_RUNTIME_FILES } from "../runtime-assets"

/**
 * The Live2D runtime files this viewer loads — the shared registry in
 * `src/runtime-assets.ts` (URLs, mirrors, sha256 pins), also used by the
 * server-side `onInstall` hook. The render side overrides the consent
 * rationale with its localized copy; the install hook uses the registry's
 * English constant.
 *
 * A failure clears the module cache so the next call (a user retry) re-runs
 * the download path.
 */

/** The narrow API surface {@link ensureLive2dRuntime} needs. */
export type Live2dRuntimeAPI = {
	readonly download: (
		requests: readonly PluginDownloadRequest[],
	) => Promise<readonly PluginDownloadResult[]>
	readonly resolveAssetUrl: (path: string) => string
	readonly deleteAsset: (path: string) => Promise<PluginAssetDeleteResult>
}

export type Live2dRuntimeError =
	| { readonly kind: "denied" }
	| { readonly kind: "unavailable" }
	| { readonly kind: "network" }
	| { readonly kind: "stale" }
	| { readonly kind: "failed" }

export type Live2dRuntimeResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: Live2dRuntimeError }

export type Live2dRuntimeOptions = {
	/** Consent-dialog rationale for the runtime downloads. */
	readonly reason: string
	/** Script injection strategy; the DOM implementation is the default. */
	readonly injectScript?: (src: string) => Promise<void>
}

let runtimePromise: Promise<Live2dRuntimeResult> | undefined

/**
 * Ensure both Live2D runtime files are present and their scripts loaded
 * into this document. Idempotent per iframe lifetime while success holds;
 * a failure clears the cache so the next call (a user retry) re-runs the
 * download path.
 */
export function ensureLive2dRuntime(
	api: Live2dRuntimeAPI,
	options: Live2dRuntimeOptions,
): Promise<Live2dRuntimeResult> {
	runtimePromise ??= loadRuntime(api, options)
	return runtimePromise
}

async function loadRuntime(
	api: Live2dRuntimeAPI,
	options: Live2dRuntimeOptions,
): Promise<Live2dRuntimeResult> {
	const globals = window as unknown as {
		Live2DCubismCore?: unknown
		PIXI?: { live2d?: unknown }
	}
	if (
		globals.Live2DCubismCore !== undefined &&
		globals.PIXI?.live2d !== undefined
	) {
		return { ok: true }
	}
	const injectScript = options.injectScript ?? injectScriptDom
	const result = await runAttempts(api, options, injectScript)
	if (!result.ok) {
		// A failure clears the module cache — the next call (a user retry)
		// re-runs the download path.
		runtimePromise = undefined
	}
	return result
}

async function runAttempts(
	api: Live2dRuntimeAPI,
	options: Live2dRuntimeOptions,
	injectScript: (src: string) => Promise<void>,
): Promise<Live2dRuntimeResult> {
	// URL sets in fallback order: attempt 0 = primaries, attempt 1 =
	// mirrors where known (mirrorless files keep their primary URL). A
	// network failure on an earlier set falls through — user decisions
	// (denied/unavailable) stop immediately.
	const urlSets = mirrorUrlSets()
	for (let attempt = 0; attempt < urlSets.length; attempt++) {
		const outcome = await attemptDownload(
			api,
			options,
			urlSets[attempt]!,
			injectScript,
		)
		if (outcome.ok) return { ok: true }
		if (
			outcome.error.kind === "denied" ||
			outcome.error.kind === "unavailable" ||
			// Stale = the pinned content no longer matches ANY source (the
			// mirrors share the pin) — mirroring would fail identically.
			outcome.error.kind === "stale"
		) {
			return outcome
		}
		if (attempt < urlSets.length - 1) continue
		return outcome
	}
	return { ok: false, error: { kind: "failed" } }
}

/**
 * One download attempt: one batched call (= ONE consent question for the
 * whole set) + script injection. A stale-cache POLICY (the vault copy no
 * longer matches the pinned digest) purges the vault files and re-runs
 * the same attempt once — a corrupted cache heals itself, and when the
 * CDN content itself changed the retry fails with the same clear error.
 */
async function attemptDownload(
	api: Live2dRuntimeAPI,
	options: Live2dRuntimeOptions,
	files: readonly {
		readonly dest: string
		readonly url: string
		readonly sha256: string
	}[],
	injectScript: (src: string) => Promise<void>,
): Promise<Live2dRuntimeResult> {
	for (let round = 0; round < 2; round++) {
		try {
			// Results arrive in request order — inject in the same order so
			// `live2d.min.js` registers `PIXI.live2d` before the cubism core
			// defines `Live2DCubismCore`.
			const results = await api.download(
				files.map((entry) => ({
					url: entry.url,
					dest: entry.dest,
					sha256: entry.sha256,
					reason: options.reason,
				})),
			)
			for (const result of results) {
				await injectScript(api.resolveAssetUrl(result.path))
			}
			return { ok: true }
		} catch (error) {
			const kind = classifyError(error)
			if (kind.kind !== "stale" || round === 1) {
				return { ok: false, error: kind }
			}
			// The vault holds bytes that no longer match the pin (or the
			// downloader verified a mismatch): purge and retry once.
			await purgeStaleRuntime(api)
		}
	}
	return { ok: false, error: { kind: "failed" } }
}

/** Remove the cached runtime files so the next attempt re-downloads them. */
async function purgeStaleRuntime(api: Live2dRuntimeAPI): Promise<void> {
	for (const entry of LIVE2D_RUNTIME_FILES) {
		await api.deleteAsset(entry.dest).catch(() => {})
	}
}

/** The download batches in fallback order (primary set first). */
function mirrorUrlSets(): readonly {
	readonly dest: string
	readonly url: string
	readonly sha256: string
}[][] {
	const maxUrls = Math.max(
		...LIVE2D_RUNTIME_FILES.map((entry) => entry.urls.length),
	)
	const sets: {
		readonly dest: string
		readonly url: string
		readonly sha256: string
	}[][] = []
	for (let index = 0; index < maxUrls; index++) {
		sets.push(
			LIVE2D_RUNTIME_FILES.map((entry) => {
				const url = entry.urls[Math.min(index, entry.urls.length - 1)]!
				return { dest: entry.dest, url, sha256: entry.sha256 }
			}),
		)
	}
	return sets
}

/** Inject one classic script into the document and wait for it to load. */
function injectScriptDom(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement("script")
		script.onload = () => resolve()
		script.onerror = () => reject(new Error(`failed to load ${src}`))
		script.src = src
		document.head.append(script)
	})
}

function classifyError(error: unknown): Live2dRuntimeError {
	// The asset API rejects with the machine-readable name in
	// `err.name` (DENIED / UNAVAILABLE / POLICY).
	if (isRecord(error) && typeof error.name === "string") {
		switch (error.name) {
			case "DENIED":
				return { kind: "denied" }
			case "UNAVAILABLE":
				return { kind: "unavailable" }
			case "POLICY": {
				const message = typeof error.message === "string" ? error.message : ""
				// Stale vault bytes or an integrity-rejected download: the
				// content no longer matches the pinned digest — purge+retry.
				if (/sha256 pin|integrity mismatch/.test(message)) {
					return { kind: "stale" }
				}
				return { kind: "failed" }
			}
			case "AbortError":
			case "TimeoutError":
				return { kind: "network" }
			case "TypeError":
				// Fetch-level failures surface as TypeError by convention.
				return { kind: "network" }
			case "Error": {
				// The bridge rethrows plain `Error` for transport-level
				// server failures; match the downloader's wording so the
				// mirror fallback engages for exactly those.
				const message = typeof error.message === "string" ? error.message : ""
				if (
					/timed out|timeout|failed to fetch|fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network|HTTP \d{3}/i.test(
						message,
					)
				) {
					return { kind: "network" }
				}
			}
		}
	}
	return { kind: "failed" }
}

/** Reset the module cache — test only. */
export function __resetLive2dRuntimeForTests(): void {
	runtimePromise = undefined
}
