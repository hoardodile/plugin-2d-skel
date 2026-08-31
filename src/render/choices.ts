/**
 * Resolve a toolbar choice against the player's discovered names. A
 * missing or stale choice falls back to `idle` for EX scenes (the pose
 * animations are expression overlays, not base motion), otherwise to the
 * first available name.
 */
export function effectiveChoice(
	names: readonly string[],
	choice: string | undefined,
	preferIdle = false,
): string | undefined {
	if (choice !== undefined && names.includes(choice)) return choice
	if (preferIdle && names.includes("idle")) return "idle"
	return names[0]
}

/**
 * EX exports mix base motion with zero-duration expression poses. Once the
 * native player has told us which animations are overlays, the base
 * dropdown should only offer the remaining names (falling back to the
 * full list while that classification is still loading).
 */
export function baseAnimationNames(
	names: readonly string[],
	overlays: readonly string[],
): readonly string[] {
	if (overlays.length === 0) return names
	const bases = names.filter((name) => !overlays.includes(name))
	return bases.length > 0 ? bases : names
}
