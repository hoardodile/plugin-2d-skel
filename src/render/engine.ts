import type { ViewportPoint, ViewportTransform } from "./canvas-view"
import type { MotionChoice, MotionGraph, MotionRef } from "../core/motion-graph"
import type { EngineScene } from "../shared"
import type { Live2dHitArea, Live2dModelInfo } from "./useLive2dPlayer"
import type { Live2dRuntimeError } from "./runtime"
import type { SpineExHitData, SpinePlayerNames } from "./useSpinePlayer"
import type { HitAreaRect } from "./hit-overlay"

export type PlayerStatus = "idle" | "loading" | "ready" | "error"

/** A scene from the book: the union scene plus its index in the list. */
export type ViewerScene = EngineScene & { readonly index: number }

export type PlayerDialogue = {
	readonly text: string | undefined
	readonly choices: readonly MotionChoice[]
}

/**
 * The surface every engine's player controller shares. The viewer renders
 * its chrome (scene selector, transport, version chip, dialogue, status)
 * against this alone; engine-specific behaviour lives behind narrowing on
 * `engine`.
 */
export type PlayerCommon<M> = {
	readonly engine: M
	readonly status: PlayerStatus
	readonly paused: boolean
	readonly togglePause: () => void
	readonly restart: () => void
	readonly dialogue: PlayerDialogue
	readonly choose: (ref: MotionRef) => void
	readonly capture: () => string | undefined
	readonly hit: (names: readonly string[]) => void
	readonly tapAt: (point: ViewportPoint, viewport: ViewportTransform) => void
	/** Apply the viewport transform natively in this engine's render surface
	 *  (Pixi model / armature for Live2D & DragonBones, the Spine skeleton for
	 *  Spine). The shell calls this uniformly; no CSS wrapper is used. */
	readonly applyViewport: (transform: ViewportTransform) => void
	/** Recover the transform actually applied right now from the engine's live
	 *  state, so a re-fit/snap-back is observable. Used for self-tests. */
	readonly getAppliedViewport: () => ViewportTransform
}

export type Live2dController = PlayerCommon<"live2d"> & {
	readonly motionGraph: MotionGraph
	readonly playGroup: (group: string) => void
	readonly playGroupEntry: (group: string, index: number) => void
	readonly setExpression: (name: string) => void
	readonly resetExpression: () => void
	readonly hitAreas: readonly Live2dHitArea[]
	readonly hitAreaRects: readonly HitAreaRect[]
	readonly modelInfo: Live2dModelInfo | undefined
	readonly runtimeError: Live2dRuntimeError | undefined
	readonly currentExpression: string | undefined
	readonly runtimeVersion?: string
	/** "Interact"-mode drag: drive the model's gaze/drag-interaction at a point. */
	readonly dragAt: (point: ViewportPoint) => void
}

export type SpineController = PlayerCommon<"spine"> & {
	readonly names: SpinePlayerNames
	readonly playMotionRef: (ref: MotionRef) => void
	readonly exHit: SpineExHitData | undefined
	readonly errorDetail?: string
	readonly runtimeVersion?: string
}

export type DragonBonesPlayerNames = {
	readonly animations: readonly string[]
	readonly armatures: readonly string[]
	readonly skins: readonly string[]
}

export type DragonBonesController = PlayerCommon<"dragonbones"> & {
	readonly names: DragonBonesPlayerNames
	readonly playAnimation: (name: string) => void
	readonly exHit: SpineExHitData | undefined
	readonly errorDetail?: string
	readonly runtimeVersion?: string
}

export type PlayerController = Live2dController | SpineController | DragonBonesController
