import { describe, expect, test } from "vitest"
import {
	defaultSpineSkinStack,
	familyIdOf,
	resolveSceneSkinStack,
	resolveSkinStack,
	type SkinStackSpec,
	skinStackConfigTemplate,
	toggleSkinLayer,
} from "./spine-stack"

// The rules are data: this declaration stands in for whatever a model folder
// ships, and the plugin interprets no skin name on its own. The names below are
// fixtures, chosen to exercise the shapes a declaration can use — a body skin,
// a multi-member layer family, a single-choice family with a preference, and a
// face family whose resting member is chosen by suffix.
const LAYERED = [
	"default",
	"body_base",
	"variant/censored",
	"variant/edited",
	"layers/one",
	"layers/two",
	"face/one_Anger",
	"face/one_CloseEye",
	"face/one_Idle",
	"face/one_Sad",
	"face/one_Shy",
	"face/one_Smile",
]

/** The same shape with a differently-cased marker and one layer family. */
const LAYERED_MIXED_CASE = [
	"default",
	"Body_Base",
	"variant/censored",
	"variant/edited",
	"layers/mixed",
	"face/one_Anger",
	"face/one_Idle",
	"face/one_Smile",
]

/** A plain export: one skin, no declaration. */
const PLAIN = ["default"]

/** A declaration of the shape a model folder can carry. */
const LAYER_SPEC: SkinStackSpec = {
	id: "fixture",
	marker: { equals: ["body_base"] },
	families: [
		{
			id: "layer",
			match: { prefix: ["layer"] },
			cardinality: "many",
			default: true,
		},
		{
			id: "variant",
			match: { prefix: ["variant/"] },
			cardinality: "one",
			default: true,
			prefer: [
				{ equals: ["variant/edited"] },
				{ equals: ["variant/censored"] },
			],
		},
		{
			id: "face",
			match: { prefix: ["face/"] },
			cardinality: "one",
			default: true,
			prefer: [{ suffix: ["_idle"] }],
		},
	],
}

/** A second declaration: a different marker, one profile family, many props. */
const ACME_SPEC: SkinStackSpec = {
	id: "acme",
	marker: { prefix: ["avatar_"] },
	families: [
		{
			id: "outfit",
			match: { prefix: ["outfit/"] },
			cardinality: "one",
			default: true,
			prefer: [{ suffix: ["_default"] }],
		},
		{
			id: "prop",
			match: { prefix: ["prop/"] },
			cardinality: "many",
			default: true,
		},
	],
}
const ACME = [
	"expression/happy",
	"avatar_main",
	"outfit/school",
	"outfit/party_default",
	"prop/hat",
]

describe("resolveSceneSkinStack", () => {
	test("mounts the body, its layers, the chosen variant and face in composite order", () => {
		expect(defaultSpineSkinStack(LAYERED, { spec: LAYER_SPEC })).toEqual([
			"body_base",
			"layers/one",
			"layers/two",
			"variant/edited",
			"face/one_Idle",
		])
		expect(
			defaultSpineSkinStack(LAYERED_MIXED_CASE, { spec: LAYER_SPEC }),
		).toEqual(["Body_Base", "layers/mixed", "variant/edited", "face/one_Idle"])
	})

	test("matches the marker whatever its capitalization", () => {
		const resolved = resolveSceneSkinStack({
			names: LAYERED_MIXED_CASE,
			config: { spec: LAYER_SPEC },
		})
		expect(resolved.applies).toBe(true)
		expect(resolved.base).toBe("Body_Base")
	})

	test("a model that declares nothing mounts a single skin", () => {
		for (const names of [PLAIN, [], ["body", "face/smile"]]) {
			const resolved = resolveSceneSkinStack({ names })
			expect(resolved.applies).toBe(false)
			expect(resolved.defaultStack).toEqual([])
		}
		// The base fallback still serves the single-skin dropdown.
		expect(resolveSkinStack(["body", "face/x"]).base).toBe("body")
		expect(resolveSkinStack(["default", "face/x"]).base).toBe("default")
	})

	test("a spec whose marker is absent composes nothing", () => {
		const resolved = resolveSceneSkinStack({
			names: ["body", "face/smile"],
			config: { spec: LAYER_SPEC },
		})
		expect(resolved.applies).toBe(false)
		expect(resolved.defaultStack).toEqual([])
	})

	test("skips families the model does not ship", () => {
		expect(defaultSpineSkinStack(["body_base"], { spec: LAYER_SPEC })).toEqual([
			"body_base",
		])
		expect(
			defaultSpineSkinStack(["body_base", "variant/censored"], {
				spec: LAYER_SPEC,
			}),
		).toEqual(["body_base", "variant/censored"])
		expect(
			defaultSpineSkinStack(["body_base", "face/x_Anger"], {
				spec: LAYER_SPEC,
			}),
		).toEqual(["body_base", "face/x_Anger"])
	})

	test("an exact stack outranks a spec", () => {
		const resolved = resolveSceneSkinStack({
			names: LAYERED,
			config: { stack: ["body_base", "layers/one"], spec: LAYER_SPEC },
		})
		expect(resolved.defaultStack).toEqual(["body_base", "layers/one"])
		// The spec still supplies the toggling rules.
		expect(familyIdOf(resolved, "face/one_Smile")).toBe("face")
	})

	test("a declared stack composes even without a spec", () => {
		const resolved = resolveSceneSkinStack({
			names: LAYERED,
			declaredStack: ["body_base", "face/one_Smile"],
		})
		expect(resolved.applies).toBe(true)
		expect(resolved.defaultStack).toEqual(["body_base", "face/one_Smile"])
		expect(resolved.base).toBe("body_base")
	})

	test("a declared stack drops names the scene does not have", () => {
		expect(
			defaultSpineSkinStack(LAYERED, undefined, ["ghost", "body_base"]),
		).toEqual(["body_base"])
	})
})

describe("toggleSkinLayer", () => {
	const resolved = () =>
		resolveSceneSkinStack({ names: LAYERED, config: { spec: LAYER_SPEC } })

	test("removes one layer without touching the rest", () => {
		const stack = resolved().defaultStack
		expect(toggleSkinLayer(resolved(), stack, "layers/two")).toEqual([
			"body_base",
			"layers/one",
			"variant/edited",
			"face/one_Idle",
		])
	})

	test("a single-choice family is single choice", () => {
		const stack = resolved().defaultStack
		expect(toggleSkinLayer(resolved(), stack, "face/one_Smile")).toEqual([
			"body_base",
			"layers/one",
			"layers/two",
			"variant/edited",
			"face/one_Smile",
		])
	})

	test("the variant members swap instead of stacking", () => {
		const stack = resolved().defaultStack
		const swapped = toggleSkinLayer(resolved(), stack, "variant/censored")
		expect(swapped).toContain("variant/censored")
		expect(swapped).not.toContain("variant/edited")
	})

	test("the body skin is pinned and the layer order is stable", () => {
		const stack = resolved().defaultStack
		expect(toggleSkinLayer(resolved(), stack, "body_base")).toEqual(stack)
		// Toggling a name back on re-orders it into composite order rather than
		// appending it at the end.
		expect(
			toggleSkinLayer(resolved(), ["face/one_Idle", "body_base"], "layers/one"),
		).toEqual(["body_base", "layers/one", "face/one_Idle"])
	})

	test("an unclassified name toggles like a plain layer", () => {
		const stack = resolved().defaultStack
		expect(toggleSkinLayer(resolved(), stack, "default")).toEqual([
			...stack,
			"default",
		])
		expect(
			toggleSkinLayer(resolved(), [...stack, "default"], "default"),
		).toEqual(stack)
	})
})

describe("a second declaration needs no code change", () => {
	const resolved = () =>
		resolveSceneSkinStack({ names: ACME, config: { spec: ACME_SPEC } })

	test("its own marker, family order and single-choice default apply", () => {
		expect(resolved().base).toBe("avatar_main")
		// Families compose in declaration order: `outfit` before `prop`.
		expect(resolved().defaultStack).toEqual([
			"avatar_main",
			"outfit/party_default",
			"prop/hat",
		])
	})

	test("its single-choice family swaps within itself only", () => {
		const swapped = toggleSkinLayer(
			resolved(),
			resolved().defaultStack,
			"outfit/school",
		)
		expect(swapped).toEqual(["avatar_main", "outfit/school", "prop/hat"])
		expect(familyIdOf(resolved(), "prop/hat")).toBe("prop")
		expect(familyIdOf(resolved(), "expression/happy")).toBeUndefined()
	})

	test("the other declaration is untouched by it", () => {
		expect(familyIdOf(resolved(), "face/one_Idle")).toBeUndefined()
		expect(
			resolveSceneSkinStack({ names: LAYERED, config: { spec: ACME_SPEC } })
				.applies,
		).toBe(false)
	})
})

describe("skinStackConfigTemplate", () => {
	test("offers the model's own names as a starter stack", () => {
		expect(JSON.parse(skinStackConfigTemplate(["default", "face/x"]))).toEqual({
			v: 1,
			stack: ["default", "face/x"],
		})
	})
})
