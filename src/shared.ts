import type { PluginSchema } from "@hoardodile/sdk-types"

/**
 * The animation engines this unified viewer can render. Live2D (official
 * Cubism + Live2DViewerEX variants), Spine (direct + EX) and DragonBones
 * (direct + EX). The union is what every scene falls under; the per-engine
 * scene shapes below are discriminated on `engine`.
 */
export type ModelEngine = "live2d" | "spine" | "dragonbones"

/**
 * One loadable model scene, discriminated by `engine`. A resource may hold
 * several scenes (costume/variant changes) and may even mix engines (a
 * Live2D costume plus a Spine background).
 */
export type Live2dScene = {
	readonly engine: "live2d"
	readonly kind: "cubism" | "ex"
	/** The descriptor that owns the scene (`*.model3.json` or `model0.json`). */
	readonly modelJson: string
	/** Friendly display name (descriptor name, else the basename). */
	readonly label?: string
	readonly moc: string
	readonly textures: readonly string[]
	readonly motionGroups: readonly string[]
	readonly expressions: readonly string[]
	/** Live2D descriptor version (Cubism 2/3), when the descriptor states it. */
	readonly version?: string
}

export type SpineScene = {
	readonly engine: "spine"
	readonly kind: "standard" | "ex"
	readonly skeleton: string
	readonly atlas: string | undefined
	readonly textures: readonly string[]
	/** Wire format of the skeleton bytes. */
	readonly format: "json" | "skel"
	/** Skeleton version as exported, e.g. `"4.1.24"`. */
	readonly version: string | undefined
	readonly animations: readonly string[]
	readonly skins: readonly string[]
	/** Friendly display name (descriptor name, else the skeleton basename). */
	readonly label?: string
	/** Present on EX scenes: the descriptor that owns the scene. */
	readonly modelJson?: string
}

export type DragonBonesScene = {
	readonly engine: "dragonbones"
	readonly kind: "standard" | "ex"
	/** The DragonBones data file (`*_ske.json` / `*_ske.dbbin` / `skeleton_0`). */
	readonly skeleton: string
	/** The DragonBones texture atlas JSON (`*_tex.json` / `atlases_N_atlas_N.json`). */
	readonly atlas: string | undefined
	readonly textures: readonly string[]
	/** Wire format of the skeleton data. */
	readonly format: "json" | "dbbin"
	/** DragonBones data version as exported, e.g. `"5.5"`. */
	readonly version: string | undefined
	/** Armature names carried by the skeleton data. */
	readonly armatures: readonly string[]
	/** Animation names carried by the skeleton data (all armatures). */
	readonly animations: readonly string[]
	readonly skins: readonly string[]
	/** Friendly display name (descriptor name, else the skeleton basename). */
	readonly label?: string
	/** Present on EX scenes: the descriptor that owns the scene. */
	readonly modelJson?: string
}

export type EngineScene = Live2dScene | SpineScene | DragonBonesScene

/** One flat file-list row: the scene group flattened for the sidecar. */
export type EngineFile = {
	readonly filename: string
	readonly role: "model" | "moc" | "texture" | "skeleton" | "atlas"
	readonly scene: number
	readonly kind?: "cubism" | "ex" | "standard"
	readonly label?: string
	readonly format?: "json" | "skel" | "dbbin"
	readonly version?: string
	/** The engine this row belongs to; set so the client fallback is unambiguous. */
	readonly engine?: ModelEngine
}

export type EngineSourceMeta = {
	readonly version?: string
	readonly modelCount?: number
	readonly animationCount?: number
	readonly motionCount?: number
	/** First model's texture bounding box (its first texture's pixel size). */
	readonly width?: number
	readonly height?: number
	readonly scenes?: readonly EngineScene[]
}

export type EngineSearchMeta = {
	readonly v: number
	readonly facets?: {
		readonly live2d?: boolean
		readonly spine?: boolean
		readonly dragonbones?: boolean
		readonly standard?: boolean
		readonly ex?: boolean
	}
}

export interface EngineSchema extends PluginSchema {
	readonly file: EngineFile
	readonly sourceMeta: EngineSourceMeta
	readonly searchMeta: EngineSearchMeta
	/** Scenes computed once by `detect`, reused by every other hook. */
	readonly detect: { readonly scenes: readonly EngineScene[] }
}

// Back-compat aliases so the migration surface is narrow: legacy names now
// point at the unified shapes.
export type Live2dFile = EngineFile
export type Live2dSourceMeta = EngineSourceMeta
export type Live2dSearchMeta = EngineSearchMeta
export type Live2dSchema = EngineSchema
