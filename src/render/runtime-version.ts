import { isRecord } from "@hoardodile/sdk-web"
import type { SpineRuntime } from "../core/spine-format"

/**
 * The concrete runtime library versions this viewer can load, surfaced in
 * the Info tab. The Spine labels must track the bundled `@esotericsoftware/
 * spine-player-*` dependencies in `package.json`; the Live2D labels come
 * from the `pixi-live2d-display` / `pixi.js` dependencies and the runtime
 * Cubism core version read off the loaded global.
 */

/** The exact branded Spine runtime versions, keyed by `SpineRuntime`. */
export const SPINE_RUNTIME_LABELS: Readonly<Record<SpineRuntime, string>> = {
	legacy: "3.8",
	"4.0": "4.0.31",
	"4.1": "4.1.56",
	"4.2": "4.2.119",
	"4.3": "4.3.13",
}

/** Label for the runtime Spine player actually serving a scene. */
export function spineRuntimeVersion(runtime: SpineRuntime): string {
	return SPINE_RUNTIME_LABELS[runtime]
}

/** The bundled Live2D renderer stack (pixi + pixi-live2d-display). */
export const LIVE2D_RENDERER_LABEL =
	"pixi-live2d-display 0.5.0-beta · pixi.js 7.4.3"

/**
 * The Live2D Cubism core version the SDK exposes once its script has
 * loaded. `Live2DCubismCore.Version` is a numeric major (e.g. `4`), but the
 * full `x.y.z` is usually readable off the core's module info; when only the
 * numeric form is present we still surface it.
 */
export function live2dCubismVersion(): string | undefined {
	const core = (window as { Live2DCubismCore?: unknown }).Live2DCubismCore
	if (!isRecord(core)) return undefined
	const version = core.Version
	if (typeof version === "number" && Number.isFinite(version)) {
		return String(version)
	}
	if (typeof version === "string" && version.length > 0) return version
	return undefined
}

/** The full Live2D runtime label for the Info panel. */
export function live2dRuntimeVersion(): string | undefined {
	const cubism = live2dCubismVersion()
	if (cubism !== undefined) return `${LIVE2D_RENDERER_LABEL} · Cubism ${cubism}`
	return LIVE2D_RENDERER_LABEL
}

/** The bundled DragonBones renderer stack (pixi + pixi-dragonbones-runtime). */
export const DRAGONBONES_RENDERER_LABEL =
	"pixi-dragonbones-runtime 7.0.0 · pixi.js 7.4.3"

/** The DragonBones runtime label for the Info panel. */
export function dragonBonesRuntimeVersion(): string {
	return DRAGONBONES_RENDERER_LABEL
}
