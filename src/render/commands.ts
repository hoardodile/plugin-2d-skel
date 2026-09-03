import {
	type MotionEntry,
	type MotionGraph,
	type MotionRef,
	parseMotionRef,
} from "../core/motion-graph"

/**
 * Live2DViewerEX controller commands that a scene emits from a motion's
 * `command`/`post_command` (and choices). Parsed into a one-value union so
 * the player dispatches them and they stay unit-testable in Node.
 */

export type ExCommand =
	| { readonly kind: "startMotion"; readonly ref: MotionRef }
	| { readonly kind: "setExpression"; readonly target: string }
	| { readonly kind: "nextExpression" }
	| { readonly kind: "mouseTracking"; readonly enabled: boolean }
	| { readonly kind: "unknown"; readonly raw: string }

export function parseExCommand(raw: string): ExCommand {
	const command = raw.trim()
	const startMotion = command.match(/^start_mtn\s+(.+)$/i)
	if (startMotion !== null) {
		const ref = parseMotionRef(startMotion[1]?.trim())
		if (ref !== undefined) return { kind: "startMotion", ref }
		return { kind: "unknown", raw }
	}
	const setExpression = command.match(/^set_exp\s+(.+)$/i)
	if (setExpression !== null) {
		return { kind: "setExpression", target: setExpression[1]!.trim() }
	}
	if (/^next_exp$/i.test(command)) return { kind: "nextExpression" }
	const mouseTracking = command.match(/^mouse_tracking\s+(enable|disable)$/i)
	if (mouseTracking !== null) {
		return {
			kind: "mouseTracking",
			enabled: mouseTracking[1]!.toLowerCase() === "enable",
		}
	}
	return { kind: "unknown", raw }
}

/**
 * The next expression name in an ordered list, wrapping at the end. When
 * the current name is not in the list (or none is set), start from the
 * first — `next_exp` cycles a model's expressions.
 */
export function nextExpressionName(
	names: readonly string[],
	current: string | undefined,
): string | undefined {
	if (names.length === 0) return undefined
	if (current === undefined) return names[0]
	const index = names.indexOf(current)
	if (index === -1) return names[0]
	return names[(index + 1) % names.length]
}

/**
 * Live2DViewerEX **Spine** skin-stack commands (`set_skins` / `add_skins` /
 * `remove_skins`). These are Spine-only: a Live2DViewerEX `type:9` model
 * assembles its full appearance from a base skin plus additive layer skins,
 * and a motion's `command` refines that stack. Kept separate from
 * {@link ExCommand} because the Spine player dispatches through its own
 * command loop; both stay unit-testable in Node.
 */
export type SkinCommand =
	| { readonly kind: "setSkins"; readonly skins: readonly string[] }
	| { readonly kind: "addSkins"; readonly skins: readonly string[] }
	| { readonly kind: "removeSkins"; readonly skins: readonly string[] }
	| { readonly kind: "unknown"; readonly raw: string }

/** Split a `set_skins`/`add_skins`/`remove_skins` argument list on commas. */
function splitSkinNames(value: string): readonly string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
}

/** Parse one Live2DViewerEX Spine skin command. */
export function parseSkinCommand(raw: string): SkinCommand {
	const command = raw.trim()
	const setSkins = command.match(/^set_skins\s+(.+)$/i)
	if (setSkins !== null) {
		return { kind: "setSkins", skins: splitSkinNames(setSkins[1]!) }
	}
	const addSkins = command.match(/^add_skins\s+(.+)$/i)
	if (addSkins !== null) {
		return { kind: "addSkins", skins: splitSkinNames(addSkins[1]!) }
	}
	const removeSkins = command.match(/^remove_skins\s+(.+)$/i)
	if (removeSkins !== null) {
		return { kind: "removeSkins", skins: splitSkinNames(removeSkins[1]!) }
	}
	return { kind: "unknown", raw }
}

/**
 * Apply a skin command to a running skin stack, returning the new stack.
 * `set_skins` replaces the stack, `add_skins` appends missing names and
 * `remove_skins` drops them; an unknown command leaves the stack unchanged.
 */
export function applySkinCommand(
	stack: readonly string[],
	command: SkinCommand,
): readonly string[] {
	switch (command.kind) {
		case "setSkins":
			return [...command.skins]
		case "addSkins": {
			const next = [...stack]
			for (const name of command.skins) {
				if (!next.includes(name)) next.push(name)
			}
			return next
		}
		case "removeSkins":
			return stack.filter((name) => !command.skins.includes(name))
		default:
			return stack
	}
}

/**
 * The composite skin stack a Live2DViewerEX Spine model should mount with.
 * Derives it from the descriptor's motion graph: an `add_skins`-refined stack
 * is only meaningful relative to the `set_skins` that seeds it, so we take the
 * first group (preferring `start` then `idle`) whose entry legitimately
 * declares a stack. `undefined` means no stack was declared, and the caller
 * falls back to the scene's own skin list.
 */
export function skinStackFromMotionGraph(
	graph: MotionGraph,
): readonly string[] | undefined {
	for (const group of ["start", "idle"]) {
		const stack = skinStackFromGroup(graph[group])
		if (stack !== undefined) return stack
	}
	for (const entries of Object.values(graph)) {
		const stack = skinStackFromGroup(entries)
		if (stack !== undefined) return stack
	}
	return undefined
}

function skinStackFromGroup(
	entries: readonly MotionEntry[] | undefined,
): readonly string[] | undefined {
	if (entries === undefined) return undefined
	for (const entry of entries) {
		// Commands within one entry run in order; require a `set_skins` so an
		// orphan `add_skins` (which refines a state set by a prior motion)
		// never produces a deliberately partial stack.
		let stack: readonly string[] = []
		let sawSet = false
		for (const command of entry.commands) {
			const parsed = parseSkinCommand(command)
			if (parsed.kind === "unknown") continue
			if (parsed.kind === "setSkins") sawSet = true
			stack = applySkinCommand(stack, parsed)
		}
		if (sawSet && stack.length > 0) return stack
	}
	return undefined
}

/**
 * The scene-level fallback when no `set_skins` stack is declared: prefer the
 * complete-body `skin_base` skin (the Live2DViewerEX composite root), then
 * `default`, then the scene's first skin.
 */
export function fallbackSkinStack(
	sceneSkins: readonly string[],
): readonly string[] {
	if (sceneSkins.includes("skin_base")) return ["skin_base"]
	if (sceneSkins.includes("default")) return ["default"]
	return sceneSkins.length > 0 ? [sceneSkins[0]!] : []
}
