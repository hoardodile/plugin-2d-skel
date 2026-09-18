import { resolveSkinStack } from "./spine-stack"

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
 * The skin a scene starts on when it composes nothing. The evaluator's base
 * picker is the only place that decides (`default`, else the first name); a
 * layered scene never reaches this — its stack comes from the model's own
 * `<model>.skins.json`. The alphabetically-first name of a layered export is
 * often an expression skin that draws nothing on its own, which is exactly why
 * a model is expected to declare its composition.
 */
export function defaultSkin(names: readonly string[]): string | undefined {
	return resolveSkinStack(names).base
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

/** What deciding "apply the plain `skin` choice" depends on. */
export type PlainSkinScene = {
	readonly ready: boolean
	/** The single skin currently chosen, when the panel offers one. */
	readonly skin: string | undefined
	/** Set on EX scenes, which drive their skins through `set_skins`. */
	readonly modelJson: string | undefined
	/**
	 * The layers the scene has composed, as the mount resolved them. Non-empty
	 * means the model declared a composition (`<model>.skins.json`, an EX
	 * `set_skins` graph, or its base skin alone) and owns its skins.
	 */
	readonly composedLayers: number
}

/**
 * Whether the plain single-skin choice should be pushed to the player.
 *
 * A scene that composes layers must NOT take this path: setting one skin
 * replaces the composite a frame after it was mounted, which is the "a layer is
 * missing on first entry, and comes back as soon as anything re-composes"
 * report — `VARGR [...Shaman Vargr]_BR_Vargr_NS1` lost its face exactly this way
 * because its base skin is also the fallback the plain path would choose.
 * An EX scene drives skins through `set_skins` instead, so it never takes it
 * either.
 */
export function shouldApplyPlainSkin(scene: PlainSkinScene): boolean {
	return (
		scene.ready &&
		scene.skin !== undefined &&
		scene.modelJson === undefined &&
		scene.composedLayers === 0
	)
}
