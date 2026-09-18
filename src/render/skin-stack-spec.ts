/**
 * The generic skin-stack evaluator: a model's own config describes how its
 * skins compose, this module turns that description plus the scene's skin-name
 * list into a selection and the toggling rules.
 *
 * There is deliberately **no convention here**: the module never looks at a
 * skin's name for meaning of its own. Each model folder ships
 * `<model>.skins.json` (written by whatever produced the folder, or hand-written
 * for any other toolchain) declaring:
 *
 * - `marker`: which skin name marks this convention (also the body skin);
 * - `families`: ordered layer groups, each with a matcher, whether it is
 *   single-choice (`"one"`) or independently switchable (`"many"`), whether it
 *   joins the default stack, and optionally which member to prefer.
 *
 * Everything is a pure function over the name list, so the rules stay unit
 * testable without a Spine runtime. The schema is the shared contract with the
 * tool that writes those declarations.
 */

/** How a name is matched. Every field is a list of case-insensitive patterns. */
export type NameMatch = {
	readonly equals?: readonly string[]
	readonly prefix?: readonly string[]
	readonly suffix?: readonly string[]
	readonly contains?: readonly string[]
	readonly regex?: string
}

/** One layer family of a convention. */
export type SkinFamilySpec = {
	readonly id: string
	readonly match: NameMatch
	/** `"many"` = independent switches; `"one"` = single choice. */
	readonly cardinality: "many" | "one"
	/** Include in the default stack; defaults to true. */
	readonly default?: boolean
	/** Patterns tried in order for the family's default member. */
	readonly prefer?: readonly NameMatch[]
}

/** A whole convention, as the model declares it. */
export type SkinStackSpec = {
	readonly id: string
	readonly marker: NameMatch
	readonly families: readonly SkinFamilySpec[]
}

/** One family resolved against a scene's skin names. */
export type ResolvedSkinFamily = {
	readonly id: string
	readonly cardinality: "many" | "one"
	/** The family's members in scene order (the body skin excluded). */
	readonly members: readonly string[]
	/** The member a single-choice family starts on. */
	readonly defaultMember: string | undefined
	readonly defaultSelected: boolean
}

/** A convention resolved against a scene's skin names. */
export type ResolvedSkinStack = {
	readonly specId: string | undefined
	/** The scene's skin names, so toggling needs no second lookup. */
	readonly names: readonly string[]
	/** True when this scene is layered at all (marker hit or stack declared). */
	readonly applies: boolean
	/**
	 * The pinned body skin: the marker match, else the declared stack's first
	 * entry, else `default`, else the first name. Present even for a scene that
	 * does not compose, so single-skin callers keep their fallback.
	 */
	readonly base: string | undefined
	readonly families: readonly ResolvedSkinFamily[]
	/** The stack to mount with. Empty when the scene does not compose. */
	readonly defaultStack: readonly string[]
}

export type ResolveSkinStackOptions = {
	/** The model's declared convention, when it ships one. */
	readonly spec?: SkinStackSpec
	/** An exact stack the model declares (config or EX `set_skins`). */
	readonly declaredStack?: readonly string[]
}

/** True when one name satisfies a match object. */
export function matchesName(
	match: NameMatch | undefined,
	name: string,
): boolean {
	if (match === undefined || typeof name !== "string") return false
	const lower = name.toLowerCase()
	const anyOf = (
		patterns: readonly string[] | undefined,
		test: (pattern: string) => boolean,
	) =>
		patterns !== undefined &&
		Array.isArray(patterns) &&
		patterns.some((pattern) => test(String(pattern).toLowerCase()))
	if (anyOf(match.equals, (pattern) => lower === pattern)) return true
	if (anyOf(match.prefix, (pattern) => lower.startsWith(pattern))) return true
	if (anyOf(match.suffix, (pattern) => lower.endsWith(pattern))) return true
	if (anyOf(match.contains, (pattern) => lower.includes(pattern))) return true
	if (typeof match.regex === "string" && match.regex.length > 0) {
		try {
			return new RegExp(match.regex, "i").test(name)
		} catch {
			// An unparsable pattern selects nothing rather than throwing: a
			// hand-written config must never break loading.
			return false
		}
	}
	return false
}

/** Every name of `names` the match selects, in scene order. */
export function matchingNames(
	match: NameMatch | undefined,
	names: readonly string[],
): readonly string[] {
	return match === undefined
		? []
		: names.filter((name) => matchesName(match, name))
}

/**
 * Resolve a model's declared convention (and/or exact stack) against the skin
 * names a scene reports.
 */
export function resolveSkinStack(
	names: readonly string[],
	options: ResolveSkinStackOptions = {},
): ResolvedSkinStack {
	const { spec, declaredStack } = options
	const declared = declaredStack?.filter((name) => names.includes(name)) ?? []
	const marker = spec === undefined ? [] : matchingNames(spec.marker, names)
	const fallbackBase =
		names.find((name) => name.toLowerCase() === "default") ?? names[0]
	const base = marker[0] ?? declared[0] ?? fallbackBase

	const families: ResolvedSkinFamily[] = (spec?.families ?? []).map(
		(family) => {
			const members = matchingNames(family.match, names).filter(
				(name) => name !== base,
			)
			const preferred = (family.prefer ?? [])
				.map((pattern) => members.find((name) => matchesName(pattern, name)))
				.find((name) => name !== undefined)
			return {
				id: family.id,
				cardinality: family.cardinality,
				members,
				defaultMember: preferred ?? members[0],
				defaultSelected: family.default !== false,
			}
		},
	)

	const applies = marker.length > 0 || declared.length > 0
	const defaults: string[] = []
	if (applies) {
		if (base !== undefined) defaults.push(base)
		if (declared.length > 0) {
			for (const name of declared) {
				if (!defaults.includes(name)) defaults.push(name)
			}
		} else {
			for (const family of families) {
				if (!family.defaultSelected) continue
				const picks =
					family.cardinality === "one" ? [family.defaultMember] : family.members
				for (const name of picks) {
					if (name !== undefined && !defaults.includes(name)) {
						defaults.push(name)
					}
				}
			}
		}
	}

	return {
		specId: spec?.id,
		names: [...names],
		applies,
		base,
		families,
		defaultStack: defaults,
	}
}

/** The family a name belongs to, or `undefined` for an unclassified name. */
export function familyIdOf(
	resolved: ResolvedSkinStack,
	name: string,
): string | undefined {
	return resolved.families.find((family) => family.members.includes(name))?.id
}

/**
 * Order a selection into composite order: the pinned body skin first, then the
 * declared families in declaration order (later layers win a shared slot), then
 * anything else in scene order. Names the scene does not have are dropped.
 */
export function stackOrder(
	resolved: ResolvedSkinStack,
	selected: readonly string[],
): readonly string[] {
	const picked = new Set(
		selected.filter((name) => resolved.names.includes(name)),
	)
	const ordered: string[] = []
	const push = (name: string | undefined) => {
		if (name === undefined || !picked.has(name) || ordered.includes(name))
			return
		ordered.push(name)
	}
	push(resolved.base)
	for (const family of resolved.families) {
		for (const member of family.members) push(member)
	}
	for (const name of resolved.names) push(name)
	return ordered
}

/**
 * Add or remove one layer of a live selection. The body skin is pinned (removing
 * it would blank the model), a `"one"` family swaps (adding a member drops its
 * siblings) and every `"many"` family toggles independently. The result is
 * always re-ordered into composite order.
 */
export function toggleStackLayer(
	resolved: ResolvedSkinStack,
	current: readonly string[],
	name: string,
): readonly string[] {
	if (resolved.base !== undefined && name === resolved.base) {
		return stackOrder(resolved, current)
	}
	const selected = new Set(current)
	if (selected.has(name)) {
		selected.delete(name)
	} else {
		const family = resolved.families.find((entry) =>
			entry.members.includes(name),
		)
		if (family?.cardinality === "one") {
			for (const sibling of family.members) selected.delete(sibling)
		}
		selected.add(name)
	}
	if (resolved.base !== undefined) selected.add(resolved.base)
	return stackOrder(resolved, [...selected])
}
