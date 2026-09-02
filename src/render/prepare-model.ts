import type { ImageVariantSpec } from "@hoardodile/sdk-web"
import { isRecord } from "@hoardodile/sdk-web"
import type { Live2dScene } from "../shared"

/**
 * Rewrite a model descriptor so every referenced file is an absolute
 * host file URL. The host serves each archived file as its own encoded
 * URL segment, so relative references would never resolve.
 */

export type PreparedLive2dModel = {
	readonly kind: Live2dScene["kind"]
	readonly settings: object
	/** The parsed descriptor, for the motion graph and hit-area mapping. */
	readonly raw: Record<string, unknown>
}

/**
 * Engine dispatch seam: pick the preparer for a scene's engine. Only the
 * Live2D preparer exists today; a Spine/DragonBones scene resolves to
 * `undefined` (never reached while detect only claims Live2D), and the
 * same seam carries a Spine/DragonBones preparer later.
 */
export function prepareModel(options: {
	readonly scene: Live2dScene
	readonly readFile: (path: string) => Promise<ArrayBuffer>
	readonly resolveFileUrl: (
		filename: string,
		variant?: ImageVariantSpec,
	) => string
	readonly resolveBaseUrl: () => string
	readonly imageVariant?: ImageVariantSpec
}): Promise<PreparedLive2dModel | undefined> {
	switch (options.scene.engine) {
		case "live2d":
			return prepareLive2dModel(options)
		default:
			return Promise.resolve(undefined)
	}
}

export async function prepareLive2dModel(options: {
	readonly scene: Live2dScene
	readonly readFile: (path: string) => Promise<ArrayBuffer>
	readonly resolveFileUrl: (
		filename: string,
		variant?: ImageVariantSpec,
	) => string
	readonly resolveBaseUrl: () => string
	readonly imageVariant?: ImageVariantSpec
}): Promise<PreparedLive2dModel | undefined> {
	const { scene, readFile, resolveFileUrl, resolveBaseUrl, imageVariant } =
		options
	const bytes = await readFile(scene.modelJson)
	let parsed: unknown
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes))
	} catch {
		return undefined
	}
	if (!isRecord(parsed)) return undefined

	// Descriptor references are relative to the descriptor itself, but the
	// host file URL space is resource-root-relative — join each ref onto
	// the descriptor's own directory before resolving (a model sitting in
	// a subdirectory keeps `REF` → `<dir>/REF`).
	const modelRef = (ref: string): string =>
		resolveFileUrl(joinRef(modelDir(scene.modelJson), ref))
	// Textures may be served as an on-demand WebP variant (same pixel
	// dimensions, `fit: "exact"`); every other reference (moc, motions,
	// physics, expressions, pose) always resolves the original bytes.
	const textureRef = (ref: string): string =>
		resolveFileUrl(joinRef(modelDir(scene.modelJson), ref), imageVariant)

	const url = resolveBaseUrl()
	if (isRecord(parsed.FileReferences)) {
		return {
			kind: scene.kind,
			raw: parsed,
			settings: {
				...parsed,
				url,
				FileReferences: rewriteCubismReferences(
					parsed.FileReferences,
					modelRef,
					textureRef,
				),
			},
		}
	}
	return {
		kind: "ex",
		raw: parsed,
		settings: {
			...parsed,
			url,
			model: resolveRef(parsed.model, modelRef),
			textures: rewriteList(parsed.textures, textureRef),
			motions: rewriteExMotionTable(parsed.motions, modelRef),
			expressions: rewriteExExpressions(parsed.expressions, modelRef),
			physics_v2: rewritePhysics(parsed.physics_v2, modelRef),
			pose: resolveRef(parsed.pose, modelRef),
			// pixi's Cubism 2 runtime reads hit areas as PascalCase `Id`/`Name`
			// on a camelCase `settings.hitAreas` key, but Live2DViewerEX configs
			// use lowercase `hit_areas`/`id`/`name` — normalize the copy handed
			// to pixi so direct taps register, while `raw` keeps the lowercase
			// form the plugin's own hit-map reads.
			hitAreas: rewriteExHitAreas(parsed.hit_areas),
		},
	}
}

/** Map EX `{id,name,motion}` hit areas into pixi's PascalCase `{Id,Name,Motion}`. */
function rewriteExHitAreas(value: unknown): unknown[] | undefined {
	if (!Array.isArray(value)) return undefined
	const out: unknown[] = []
	for (const entry of value) {
		if (!isRecord(entry)) continue
		const id = typeof entry.Id === "string" ? entry.Id : entry.id
		const name = typeof entry.Name === "string" ? entry.Name : entry.name
		if (typeof id !== "string" || typeof name !== "string") continue
		out.push({ Id: id, Name: name, Motion: entry.Motion ?? entry.motion })
	}
	return out
}

/** Directory of a resource-relative path ("" for a root-level file). */
function modelDir(modelJson: string): string {
	const slash = modelJson.lastIndexOf("/")
	return slash === -1 ? "" : modelJson.slice(0, slash)
}

/** Join a descriptor-relative ref onto the descriptor's directory. */
function joinRef(dir: string, ref: string): string {
	const clean = ref.replace(/^\.\//, "")
	return dir === "" ? clean : `${dir}/${clean}`
}

function resolveRef(
	value: unknown,
	resolveFileUrl: (filename: string) => string,
): string | undefined {
	return typeof value === "string" && value.length > 0
		? resolveFileUrl(value)
		: undefined
}

function rewriteList(
	value: unknown,
	resolveFileUrl: (filename: string) => string,
): string[] | undefined {
	if (!Array.isArray(value)) return undefined
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.map(resolveFileUrl)
}

function rewritePhysics(
	value: unknown,
	resolveFileUrl: (filename: string) => string,
): unknown {
	if (typeof value === "string") return resolveFileUrl(value)
	if (!isRecord(value)) return value
	if (typeof value.File === "string") {
		return { ...value, File: resolveFileUrl(value.File) }
	}
	if (typeof value.file === "string") {
		return { ...value, file: resolveFileUrl(value.file) }
	}
	return value
}

function rewriteCubismReferences(
	refs: Record<string, unknown>,
	resolveFileUrl: (filename: string) => string,
	textureRef: (filename: string) => string,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...refs }
	if (typeof refs.Moc === "string") next.Moc = resolveFileUrl(refs.Moc)
	if (Array.isArray(refs.Textures))
		next.Textures = rewriteList(refs.Textures, textureRef)
	if (typeof refs.Physics === "string")
		next.Physics = resolveFileUrl(refs.Physics)
	if (refs.PhysicsV2 !== undefined) {
		next.PhysicsV2 = rewritePhysics(refs.PhysicsV2, resolveFileUrl)
	}
	if (isRecord(refs.Motions)) {
		next.Motions = rewriteCubismMotionTable(refs.Motions, resolveFileUrl)
	}
	if (Array.isArray(refs.Expressions)) {
		next.Expressions = refs.Expressions.map((entry) =>
			isRecord(entry) && typeof entry.File === "string"
				? { ...entry, File: resolveFileUrl(entry.File) }
				: entry,
		)
	}
	return next
}

function rewriteCubismMotionTable(
	motions: Record<string, unknown>,
	resolveFileUrl: (filename: string) => string,
): Record<string, unknown> {
	const next: Record<string, unknown> = {}
	for (const [group, entries] of Object.entries(motions)) {
		if (!Array.isArray(entries)) continue
		next[group] = entries.map((entry) => {
			if (!isRecord(entry)) return entry
			const rewritten: Record<string, unknown> = { ...entry }
			if (typeof entry.File === "string")
				rewritten.File = resolveFileUrl(entry.File)
			if (typeof entry.Sound === "string") {
				rewritten.Sound = resolveFileUrl(entry.Sound)
			}
			return rewritten
		})
	}
	return next
}

function rewriteExMotionTable(
	motions: unknown,
	resolveFileUrl: (filename: string) => string,
): Record<string, unknown> | undefined {
	if (!isRecord(motions)) return undefined
	const next: Record<string, unknown> = {}
	for (const [group, entries] of Object.entries(motions)) {
		if (!Array.isArray(entries)) continue
		next[group] = entries.map((entry) => {
			if (!isRecord(entry)) return entry
			const rewritten: Record<string, unknown> = { ...entry }
			if (typeof entry.file === "string") {
				rewritten.file = resolveFileUrl(entry.file)
			}
			if (typeof entry.sound === "string") {
				rewritten.sound = resolveFileUrl(entry.sound)
			}
			return rewritten
		})
	}
	return next
}

function rewriteExExpressions(
	expressions: unknown,
	resolveFileUrl: (filename: string) => string,
): unknown[] | undefined {
	if (!Array.isArray(expressions)) return undefined
	return expressions.map((entry) =>
		isRecord(entry) && typeof entry.file === "string"
			? { ...entry, file: resolveFileUrl(entry.file) }
			: entry,
	)
}
