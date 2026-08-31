import { parseMotionRef, type MotionRef } from "../core/motion-graph"

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
