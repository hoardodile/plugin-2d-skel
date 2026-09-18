/**
 * Scene-level composition policy: the one place that decides which declaration
 * wins for a model, and the API the player and the panels use.
 *
 * The rules themselves are data — the model's own `<model>.skins.json` (see
 * `core/skin-stack-config.ts`) evaluated by `skin-stack-spec.ts`. This module
 * adds no convention: a scene with no declaration renders a single skin.
 *
 * Priority, most specific first:
 *
 * 1. the config's exact `stack` (a list the model's author wrote for it);
 * 2. an EX descriptor's own `set_skins` commands (its motion graph declares
 *    the mount stack);
 * 3. the config's `spec` (family rules: what to select, what toggles);
 * 4. nothing — `defaultStack` stays empty and the scene keeps one skin.
 */
import {
	SKIN_STACK_SCHEMA,
	type SkinStackConfig,
} from "../core/skin-stack-config"
import {
	type ResolvedSkinStack,
	resolveSkinStack,
	stackOrder,
	toggleStackLayer,
} from "./skin-stack-spec"

export {
	familyIdOf,
	matchesName,
	matchingNames,
	type NameMatch,
	type ResolvedSkinFamily,
	type ResolvedSkinStack,
	resolveSkinStack,
	type SkinFamilySpec,
	type SkinStackSpec,
	stackOrder,
	toggleStackLayer,
} from "./skin-stack-spec"

export type ResolveSceneSkinStackOptions = {
	/** The scene's skin names, as the runtime reports them. */
	readonly names: readonly string[]
	/** The model's own declaration, when the folder ships one. */
	readonly config?: SkinStackConfig
	/** A stack declared by the scene's descriptor (EX `set_skins`). */
	readonly declaredStack?: readonly string[]
}

/** Resolve one scene's composite skin stack. */
export function resolveSceneSkinStack(
	options: ResolveSceneSkinStackOptions,
): ResolvedSkinStack {
	const { names, config, declaredStack } = options
	const declared = config?.stack ?? declaredStack
	return resolveSkinStack(names, {
		...(config?.spec !== undefined ? { spec: config.spec } : {}),
		...(declared !== undefined && declared.length > 0
			? { declaredStack: declared }
			: {}),
	})
}

/** The stack a scene mounts with (empty when it declares none). */
export function defaultSpineSkinStack(
	names: readonly string[],
	config?: SkinStackConfig,
	declaredStack?: readonly string[],
): readonly string[] {
	return resolveSceneSkinStack({ names, config, declaredStack }).defaultStack
}

/** Toggle one layer of a live selection (kept for callers holding only names). */
export function toggleSkinLayer(
	resolved: ResolvedSkinStack,
	current: readonly string[],
	name: string,
): readonly string[] {
	return toggleStackLayer(resolved, current, name)
}

/** Re-order a selection into composite order (see `stackOrder`). */
export function orderSkinStack(
	resolved: ResolvedSkinStack,
	selected: readonly string[],
): readonly string[] {
	return stackOrder(resolved, selected)
}

/**
 * A starter declaration for a model that ships none, listing the scene's own
 * skin names as an exact stack. Presented in the Controls panel (the viewer
 * cannot write into a resource folder, so the user saves the file themselves);
 * the `spec` form in the module docs is the richer alternative.
 */
export function skinStackConfigTemplate(names: readonly string[]): string {
	return `${JSON.stringify({ v: SKIN_STACK_SCHEMA, stack: [...names] }, null, "\t")}\n`
}
