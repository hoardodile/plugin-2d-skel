import { isRecord } from "@hoardodile/sdk-web"
import { type MotionRef, parseMotionRef } from "../core/motion-graph"

/**
 * Interactive-region helpers shared by the player, expressed over the
 * engine-agnostic `MotionRef`. Kept in their own module so the hit-map
 * and expression-file mapping are testable in a Node environment.
 */

/** Map descriptor hit areas (name → motion ref) the player can trigger. */
export function buildHitMap(value: unknown): ReadonlyMap<string, MotionRef> {
	const map = new Map<string, MotionRef>()
	if (!Array.isArray(value)) return map
	for (const entry of value) {
		if (!isRecord(entry)) continue
		const name = entry.name ?? entry.Name
		// Official Cubism uses PascalCase `Motion`; Live2DViewerEX uses the
		// lowercase `motion`. Both reference a group or `group:entry`.
		const motion =
			typeof entry.motion === "string" ? entry.motion : entry.Motion
		const ref = parseMotionRef(typeof motion === "string" ? motion : undefined)
		if (typeof name === "string" && ref !== undefined) map.set(name, ref)
	}
	return map
}

/**
 * Map an expression's file path (and basename) to its name, so a
 * Live2DViewerEX `set_exp <file>` command can select the expression the
 * descriptor names (`{ name, file }` / `{ Name, File }`).
 */
export function buildExpressionFileMap(
	value: unknown,
): ReadonlyMap<string, string> {
	const map = new Map<string, string>()
	const refs = isRecord(value)
		? Array.isArray(value.Expressions)
			? value.Expressions
			: value.expressions
		: undefined
	if (!Array.isArray(refs)) return map
	for (const entry of refs) {
		if (!isRecord(entry)) continue
		const name = typeof entry.Name === "string" ? entry.Name : entry.name
		const file = typeof entry.File === "string" ? entry.File : entry.file
		if (typeof name !== "string" || typeof file !== "string") continue
		map.set(file, name)
		map.set(pathBasename(file), name)
	}
	return map
}

export function pathBasename(path: string): string {
	const slash = path.lastIndexOf("/")
	return slash === -1 ? path : path.slice(slash + 1)
}
