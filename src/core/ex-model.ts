/**
 * Live2DViewerEX model descriptor, the Spine subset, for the renderer.
 * `type: 9` is a Spine skeleton (JSON or binary) with a text atlas whose
 * page names are remapped through `tex_names`; `type: 10` is DragonBones
 * and is intentionally not claimed by this plugin. Unlike `model-json.ts`
 * (the detector's descriptor parser), this keeps the `raw` object so the
 * renderer can read `motions`, `hit_areas` and `bounds`.
 */

export type ExAtlasRef = {
	readonly atlas: string
	readonly texNames: readonly string[]
	readonly textures: readonly string[]
}

export type ExModelDocument =
	| {
			readonly kind: "spine"
			readonly skeleton: string
			readonly atlases: readonly ExAtlasRef[]
			readonly motionGroups: readonly string[]
			readonly raw: Record<string, unknown>
	  }
	| {
			readonly kind: "dragonbones"
			readonly skeleton: string
			readonly atlases: readonly ExAtlasRef[]
			readonly motionGroups: readonly string[]
			readonly raw: Record<string, unknown>
	  }

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

function readStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.filter(isNonEmptyString)
}

/** True for `model0.json`-style descriptors, not motion or physics files. */
export function isExModelJsonName(filename: string): boolean {
	const base = filename.slice(filename.lastIndexOf("/") + 1).toLowerCase()
	return base.startsWith("model") && base.endsWith(".json")
}

/** Parse a type 9/10 descriptor; anything else is `undefined`. */
export function parseExModelJson(text: string): ExModelDocument | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return undefined
	}
	if (!isRecord(parsed)) return undefined
	if (parsed.type !== 9 && parsed.type !== 10) return undefined

	const skeleton = parsed.skeleton
	if (!isNonEmptyString(skeleton)) return undefined
	const atlases = readAtlasRefs(parsed.atlases)
	if (atlases.length === 0) return undefined

	return {
		kind: parsed.type === 9 ? "spine" : "dragonbones",
		skeleton,
		atlases,
		motionGroups: isRecord(parsed.motions)
			? Object.keys(parsed.motions).filter(isNonEmptyString)
			: [],
		raw: parsed,
	}
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
			texNames: readStringList(entry.tex_names),
			textures: readStringList(entry.textures),
		})
	}
	return refs
}
