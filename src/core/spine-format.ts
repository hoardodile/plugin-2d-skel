/** The bundled runtimes the viewer can hand a skeleton to. */
export type SpineRuntime = "legacy" | "4.0" | "4.1" | "4.2" | "4.3"

export type SpineVersion = {
	readonly raw: string
	readonly major: number
	readonly minor: number
	readonly patch: number
}

/**
 * What one pass over a skeleton file knows before a runtime touches it:
 * the export version plus the animation/skin names (JSON only — binary
 * headers do not carry name tables).
 */
export type SpineDocument = {
	readonly version: SpineVersion | undefined
	readonly animations: readonly string[]
	readonly skins: readonly string[]
}

const SPINE_VERSION_PATTERN = /(\d+)\.(\d+)\.(\d+)/

const TEXTURE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".ktx",
	".ktx2",
])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
}

/** Lower-cased extension with leading dot, or `""` when there is none. */
export function extname(filename: string): string {
	const dot = filename.lastIndexOf(".")
	return dot === -1 ? "" : filename.slice(dot).toLowerCase()
}

/** The archive-relative directory of a path, or `""` for a flat file. */
export function dirname(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? "" : filename.slice(0, slash)
}

/** The final path segment, extension removed. */
export function basename(filename: string): string {
	const slash = filename.lastIndexOf("/")
	const base = slash === -1 ? filename : filename.slice(slash + 1)
	const dot = base.lastIndexOf(".")
	return dot === -1 ? base : base.slice(0, dot)
}

/** True when the name is a texture page a Spine atlas may reference. */
export function isTextureName(filename: string): boolean {
	return TEXTURE_EXTENSIONS.has(extname(filename))
}

/** True when the name is a candidate skeleton payload (`.json` / `.skel`). */
export function isSkeletonName(filename: string): boolean {
	const ext = extname(filename)
	return ext === ".json" || ext === ".skel"
}

/** True when the name is a candidate atlas payload (`.atlas`). */
export function isAtlasName(filename: string): boolean {
	return extname(filename) === ".atlas"
}

/** Parse a Spine editor version string such as `"4.1.24"`. */
export function parseSpineVersion(
	raw: string | null | undefined,
): SpineVersion | undefined {
	if (typeof raw !== "string") return undefined
	const match = SPINE_VERSION_PATTERN.exec(raw)
	if (match === null) return undefined
	const major = Number(match[1])
	const minor = Number(match[2])
	const patch = Number(match[3])
	if (
		!Number.isFinite(major) ||
		!Number.isFinite(minor) ||
		!Number.isFinite(patch)
	) {
		return undefined
	}
	return { raw, major, minor, patch }
}

/**
 * The bundled runtime that speaks a version. 4.x minor versions pin
 * exactly; anything newer than the bundled 4.3 runtime falls forward to
 * it (the Spine runtime accepts newer export data within its own major
 * when the minor is higher than the bundled one).
 *
 * 3.8.75 is special: the bundled legacy runtime hard-rejects that exact
 * version, but the data format is otherwise compatible. `prepareSpineAssets`
 * rewrites the version marker before it reaches the runtime, so it still
 * maps here to `legacy`.
 */
export function runtimeFor(
	version: SpineVersion | undefined,
): SpineRuntime | undefined {
	if (version === undefined) return undefined
	if (version.major === 3) return "legacy"
	if (version.major !== 4) return undefined
	if (version.minor >= 3) return "4.3"
	return `4.${version.minor}` as SpineRuntime
}

/** True when the legacy runtime will reject the version without a rewrite. */
export function isLegacyRejectedVersion(
	version: SpineVersion | undefined,
): boolean {
	return (
		version !== undefined &&
		version.major === 3 &&
		version.minor === 8 &&
		version.patch === 75
	)
}

/** Validate one animation/skin name: non-empty string. */
function isName(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

/** Object keys or array `{ name }` entries, whichever the export uses. */
function readNames(value: unknown): string[] {
	const names: string[] = []
	if (isRecord(value)) {
		names.push(...Object.keys(value).filter(isName))
	} else if (Array.isArray(value)) {
		for (const entry of value) {
			if (isRecord(entry) && isName(entry.name)) names.push(entry.name)
		}
	}
	return [...new Set(names)].sort(naturalCompare)
}

/**
 * Parse a JSON skeleton export. Only documents carrying a `skeleton.spine`
 * version string count — every other `.json` in the resource is ignored.
 */
export function readJsonSpineDocument(text: string): SpineDocument | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return undefined
	}
	if (!isRecord(parsed) || !isRecord(parsed.skeleton)) return undefined
	if (!isName(parsed.skeleton.spine)) return undefined
	return {
		version: parseSpineVersion(parsed.skeleton.spine),
		animations: readNames(parsed.animations),
		skins: readNames(parsed.skins),
	}
}

const JSON_SPINE_HEADER_PATTERN = /"spine"\s*:\s*"(\d+\.\d+\.\d+)/

/**
 * Cheap JSON gate: read the skeleton version out of the first page of
 * bytes without parsing the whole document, so unrelated large `.json`
 * files never get a full read.
 */
export function readJsonSpineHeader(
	bytes: Uint8Array,
): SpineVersion | undefined {
	const header = new TextDecoder().decode(bytes.slice(0, 64 * 1024))
	const match = JSON_SPINE_HEADER_PATTERN.exec(header)
	return match === null ? undefined : parseSpineVersion(match[1])
}

/**
 * Read a binary skeleton header. Official `.skel` stores the version as
 * its first string; Live2DViewerEX binary skeletons store a length-
 * prefixed hash first and the version right after it. Scanning the first
 * page of bytes covers both — the hash alphabet carries no dots, so a
 * version-shaped match there is the version field itself.
 */
export function readBinarySpineDocument(
	bytes: Uint8Array,
): SpineDocument | undefined {
	const window = bytes.slice(0, 128)
	const header = new TextDecoder("latin1").decode(window)
	const match = SPINE_VERSION_PATTERN.exec(header)
	if (match === null) return undefined
	const version = parseSpineVersion(match[0])
	if (version === undefined) return undefined
	return { version, animations: [], skins: [] }
}

/** Read a skeleton payload, routed by extension. */
export function readSpineDocument(
	bytes: Uint8Array,
	filename: string,
): SpineDocument | undefined {
	if (extname(filename) === ".json") {
		return readJsonSpineDocument(new TextDecoder().decode(bytes))
	}
	if (extname(filename) === ".skel") return readBinarySpineDocument(bytes)
	return undefined
}
