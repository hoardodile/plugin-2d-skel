/**
 * The model descriptor formats a Live2D resource can carry:
 *
 * - official Cubism `*.model3.json` (PascalCase `FileReferences.Moc`;
 *   `Version` is usual but Live2DViewerEX Cubism exports often omit it)
 * - Live2DViewerEX Live2D config (`model: *.moc`, lowercase `motions`)
 * - Live2DViewerEX Spine config (`type: 9`, `skeleton` + `atlases`)
 * - Live2DViewerEX DragonBones config (`type: 10`, `skeleton` + JSON atlas)
 *
 * This module only reads the descriptor shell. Motion entries are parsed
 * by `motion-graph.ts` on the client, where the full graph is needed.
 */

export type ExAtlasRef = {
	readonly atlas: string
	readonly texNames: readonly string[]
	readonly textures: readonly string[]
}

export type ModelJsonDocument =
	| {
			readonly kind: "cubism"
			readonly label?: string
			readonly moc: string
			readonly textures: readonly string[]
			readonly motionGroups: readonly string[]
			readonly expressions: readonly string[]
			readonly version: number
	  }
	| {
			readonly kind: "ex-cubism"
			readonly label?: string
			readonly moc: string
			readonly textures: readonly string[]
			readonly motionGroups: readonly string[]
			readonly expressions: readonly string[]
			readonly version: number
	  }
	| {
			readonly kind: "ex-live2d"
			readonly label?: string
			readonly moc: string
			readonly textures: readonly string[]
			readonly motionGroups: readonly string[]
			readonly expressions: readonly string[]
	  }
	| {
			readonly kind: "ex-spine"
			readonly label?: string
			readonly skeleton: string
			readonly atlases: readonly ExAtlasRef[]
			readonly motionGroups: readonly string[]
	  }
	| {
			readonly kind: "ex-dragonbones"
			readonly label?: string
			readonly skeleton: string
			readonly atlases: readonly ExAtlasRef[]
			readonly motionGroups: readonly string[]
	  }

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

/** Object keys or `[{ Name/name }]` entries, whichever the format uses. */
function readNames(value: unknown, nameKey: string): string[] {
	const names: string[] = []
	if (isRecord(value)) {
		names.push(...Object.keys(value).filter(isNonEmptyString))
	} else if (Array.isArray(value)) {
		for (const entry of value) {
			if (!isRecord(entry)) continue
			const name = entry[nameKey] ?? entry.name
			if (isNonEmptyString(name)) names.push(name)
		}
	}
	return [...new Set(names)]
}

function readTextureNames(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	// Some Live2DViewerEX exports carry empty placeholder texture entries
	// ("Textures": ["a.png", ""]). Drop them instead of rejecting the whole
	// array, so a real texture still yields a loadable scene.
	return [...new Set(value.filter(isNonEmptyString))]
}

function readMotionGroups(value: unknown): string[] {
	if (!isRecord(value)) return []
	return Object.keys(value).filter(isNonEmptyString)
}

function readAtlasRefs(value: unknown): readonly ExAtlasRef[] {
	if (!Array.isArray(value)) return []
	const refs: ExAtlasRef[] = []
	for (const entry of value) {
		if (!isRecord(entry)) continue
		const atlas = entry.atlas
		if (!isNonEmptyString(atlas)) continue
		refs.push({
			atlas,
			texNames: readTextureNames(entry.tex_names ?? entry.texNames),
			textures: readTextureNames(entry.textures),
		})
	}
	return refs
}

function readVersion(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined
	return value
}

/** A friendly display name from the descriptor, if it carries one. */
function readMaybeLabel(value: Record<string, unknown>): string | undefined {
	for (const key of [
		"ModelName",
		"modelName",
		"Name",
		"name",
		"Title",
		"title",
	]) {
		if (isNonEmptyString(value[key])) return value[key]
	}
	return undefined
}

/** True when the filename is a model descriptor worth parsing. */
export function isModelJsonName(filename: string): boolean {
	const base = filename.slice(filename.lastIndexOf("/") + 1).toLowerCase()
	return (
		(base.startsWith("model") && base.endsWith(".json")) ||
		base.endsWith(".model.json") ||
		base.endsWith(".model3.json")
	)
}

/**
 * Live2DViewerEX names every variant `model0.json`, `model1.json`, …
 * Those are EX resources even when the inner JSON uses the official
 * Cubism PascalCase shape; `*.model3.json` is the official convention.
 */
export function isExModelFileName(filename: string): boolean {
	const base = filename.slice(filename.lastIndexOf("/") + 1)
	return /^model\d+\.json$/i.test(base)
}

/** Parse one model descriptor shell, or `undefined` when it is none. */
export function parseModelJson(
	text: string,
	filename?: string,
): ModelJsonDocument | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return undefined
	}
	if (!isRecord(parsed)) return undefined

	const label = readMaybeLabel(parsed)
	const cubism = readCubismDocument(parsed)
	if (cubism !== undefined) {
		return filename !== undefined && isExModelFileName(filename)
			? { ...cubism, kind: "ex-cubism", label }
			: { ...cubism, label }
	}

	const ex = readExDocument(parsed)
	if (ex !== undefined) return { ...ex, label }
	return undefined
}

/**
 * Cubism 3+ moc files end in `.moc3`; everything else in this branch is
 * the Cubism 2 `.moc`. Used only when the descriptor omits `Version`.
 */
function cubismVersionOf(value: Record<string, unknown>, moc: string): number {
	const listed = readVersion(value.Version)
	if (listed !== undefined) return listed
	return moc.toLowerCase().endsWith(".moc3") ? 3 : 2
}

function readCubismDocument(
	value: Record<string, unknown>,
): Extract<ModelJsonDocument, { readonly kind: "cubism" }> | undefined {
	if (!isRecord(value.FileReferences)) return undefined
	const moc = value.FileReferences.Moc
	if (!isNonEmptyString(moc)) return undefined

	return {
		kind: "cubism",
		moc,
		textures: readTextureNames(value.FileReferences.Textures),
		motionGroups: readMotionGroups(value.FileReferences.Motions),
		expressions: readNames(value.FileReferences.Expressions, "Name"),
		version: cubismVersionOf(value, moc),
	}
}

function readExDocument(
	value: Record<string, unknown>,
): ModelJsonDocument | undefined {
	const type = value.type
	if (type === 9 || type === 10) {
		const skeleton = value.skeleton
		if (!isNonEmptyString(skeleton)) return undefined
		const atlases = readAtlasRefs(value.atlases)
		if (atlases.length === 0) return undefined
		return {
			kind: type === 9 ? "ex-spine" : "ex-dragonbones",
			skeleton,
			atlases,
			motionGroups: readMotionGroups(value.motions),
		}
	}

	const moc = value.model
	if (!isNonEmptyString(moc)) return undefined
	if (!Array.isArray(value.textures)) return undefined
	return {
		kind: "ex-live2d",
		moc,
		textures: readTextureNames(value.textures),
		motionGroups: readMotionGroups(value.motions),
		expressions: readNames(value.expressions, "name"),
	}
}
