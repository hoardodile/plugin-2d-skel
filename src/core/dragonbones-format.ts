import { dirname, extname, isTextureName, naturalCompare } from "./spine-format"

/**
 * Full basename (extension kept). The spine-format `basename` strips the
 * extension, but DragonBones naming keys on the full `*_ske.json` / `*_tex.json`
 * suffix, so every name check must operate on the complete path segment.
 */
function baseName(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? filename : filename.slice(slash + 1)
}

/**
 * DragonBones format detection and lightweight document reading.
 *
 * DragonBones ships two kinds of skeleton data:
 * - JSON export (`*_ske.json`): a JSON object carrying a `version` string
 *   and an `armature` array.
 * - Binary export (`*_ske.dbbin` or an extensionless file): a `DBDT`-magic
 *   binary that wraps the same JSON object (plus binary animation blocks).
 *
 * The texture atlas is a separate `*_tex.json` with a `SubTexture` array and
 * an `imagePath` naming the page image.
 *
 * This module only reads the shell for detection/sidecar metadata
 * (version + armature/animation/skin names); the renderer hands the raw
 * bytes or JSON object to the DragonBones runtime to actually play it.
 */

export type DragonBonesVersion = {
	readonly raw: string
}

export type DragonBonesDocument = {
	readonly version: DragonBonesVersion | undefined
	readonly armatures: readonly string[]
	readonly animations: readonly string[]
	readonly skins: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isName(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

/** True when the filename looks like a DragonBones skeleton payload. */
export function isDragonBonesSkeletonFileName(filename: string): boolean {
	const base = baseName(filename).toLowerCase()
	if (base.endsWith("_ske.json")) return true
	if (base.endsWith("_ske.dbbin")) return true
	if (base.endsWith(".dbbin")) return true
	return false
}

/** True when the filename looks like a DragonBones texture atlas payload. */
export function isDragonBonesAtlasName(filename: string): boolean {
	return baseName(filename).toLowerCase().endsWith("_tex.json")
}

/** Strip a trailing suffix from a filename, clamped to a sane bound. */
function stripSuffix(base: string, suffix: string): string {
	const lower = base.toLowerCase()
	if (lower.endsWith(suffix)) return base.slice(0, base.length - suffix.length)
	return base
}

/** The logical stem of a `*_ske.json` / `*_ske.dbbin` file (`starter`). */
export function skeletonStem(filename: string): string {
	const base = baseName(filename)
	return stripSuffix(stripSuffix(base, "_ske.dbbin"), "_ske.json")
}

/** The logical stem of a `*_tex.json` atlas file (`starter`). */
export function atlasStem(filename: string): string {
	return stripSuffix(baseName(filename), "_tex.json")
}

/**
 * Read the embedded JSON object out of a DBBT (binary DragonBones) payload.
 * The binary format begins with the `DBDT` magic, a few header fields and
 * then the JSON object; binary animation blocks follow it, so only the
 * balanced JSON region is returned.
 */
function extractDbbtJson(bytes: Uint8Array | ArrayBuffer): string | undefined {
	const view =
		bytes instanceof Uint8Array
			? bytes
			: new Uint8Array(bytes.slice(0) as ArrayBuffer)
	const text = new TextDecoder("latin1").decode(view)
	const start = text.indexOf("{")
	if (start === -1) return undefined
	let depth = 0
	let inString = false
	let escaped = false
	for (let i = start; i < text.length; i++) {
		const char = text[i]
		if (inString) {
			if (escaped) escaped = false
			else if (char === "\\") escaped = true
			else if (char === '"') inString = false
			continue
		}
		if (char === '"') {
			inString = true
			continue
		}
		if (char === "{") depth++
		else if (char === "}") {
			depth--
			if (depth === 0) return text.slice(start, i + 1)
		}
	}
	return undefined
}

/** True when the first bytes carry the DBBT binary magic. */
export function hasDbbtMagic(bytes: Uint8Array | ArrayBuffer): boolean {
	const view =
		bytes instanceof Uint8Array
			? bytes
			: new Uint8Array(bytes.slice(0) as ArrayBuffer)
	return (
		view.length >= 4 &&
		view[0] === 0x44 &&
		view[1] === 0x42 &&
		view[2] === 0x44 &&
		view[3] === 0x54
	)
}

function parseJsonDocument(parsed: unknown): DragonBonesDocument | undefined {
	if (!isRecord(parsed)) return undefined
	if (!Array.isArray(parsed.armature) || parsed.armature.length === 0) {
		return undefined
	}
	const version = isName(parsed.version) ? { raw: parsed.version } : undefined
	const armatures: string[] = []
	const animations: string[] = []
	const skins: string[] = []
	for (const arm of parsed.armature) {
		if (!isRecord(arm)) continue
		if (isName(arm.name)) armatures.push(arm.name)
		if (Array.isArray(arm.animation)) {
			for (const anim of arm.animation) {
				if (isRecord(anim) && isName(anim.name)) animations.push(anim.name)
			}
		}
		if (Array.isArray(arm.skin)) {
			for (const skin of arm.skin) {
				if (isRecord(skin) && isName(skin.name)) skins.push(skin.name)
			}
		}
	}
	return {
		version,
		armatures: [...new Set(armatures)],
		animations: [...new Set(animations)].sort(naturalCompare),
		skins: [...new Set(skins)],
	}
}

/**
 * Read a DragonBones skeleton document. Accepts the file bytes (binary or
 * JSON — routed by extension/magic) and returns `undefined` when the file is
 * not a DragonBones skeleton.
 */
export function readDragonBonesDocument(
	bytes: Uint8Array | ArrayBuffer,
	filename: string,
): DragonBonesDocument | undefined {
	const ext = extname(filename)
	if (ext === ".json" || ext === "") {
		const text =
			ext === ".json"
				? new TextDecoder().decode(
						bytes instanceof Uint8Array
							? bytes
							: new Uint8Array(bytes.slice(0) as ArrayBuffer),
					)
				: undefined
		if (text !== undefined) {
			try {
				return parseJsonDocument(JSON.parse(text))
			} catch {
				// fall through to the binary branch
			}
		}
	}

	if (!hasDbbtMagic(bytes)) return undefined
	const json = extractDbbtJson(bytes)
	if (json === undefined) return undefined
	try {
		return parseJsonDocument(JSON.parse(json))
	} catch {
		return undefined
	}
}

/** The texture page name the atlas `imagePath` refers to, resolved to a file. */
export function textureForAtlas(
	atlas: string,
	atlasContent: string | undefined,
	files: readonly string[],
	directory: string,
): readonly string[] {
	const imagePath = readImagePath(atlasContent)
	if (imagePath !== undefined) {
		const resolved = directory === "" ? imagePath : `${directory}/${imagePath}`
		if (files.includes(resolved)) return [resolved]
	}

	// Fall back to the conventional `*_tex.png` next to the atlas.
	const conventional =
		directory === ""
			? `${atlasStem(atlas)}_tex.png`
			: `${directory}/${atlasStem(atlas)}_tex.png`
	if (files.includes(conventional)) return [conventional]

	return files
		.filter((name) => isTextureName(name) && dirname(name) === directory)
		.sort(naturalCompare)
}

function readImagePath(atlasContent: string | undefined): string | undefined {
	if (atlasContent === undefined) return undefined
	try {
		const parsed: unknown = JSON.parse(atlasContent)
		return isRecord(parsed) && isName(parsed.imagePath)
			? parsed.imagePath
			: undefined
	} catch {
		return undefined
	}
}

/** True when a parsed atlas JSON carries a `SubTexture` array. */
export function isDragonBonesAtlasContent(text: string): boolean {
	try {
		const parsed: unknown = JSON.parse(text)
		if (!isRecord(parsed)) return false
		return Array.isArray(parsed.SubTexture) && parsed.SubTexture.length > 0
	} catch {
		return false
	}
}
