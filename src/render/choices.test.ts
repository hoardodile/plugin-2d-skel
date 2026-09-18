import { describe, expect, test } from "vitest"
import {
	baseAnimationNames,
	defaultSkin,
	effectiveChoice,
	shouldApplyPlainSkin,
} from "./choices"

describe("choices", () => {
	test("effectiveChoice prefers a valid choice, else idle, else first", () => {
		expect(effectiveChoice(["idle", "run"], "run")).toBe("run")
		expect(effectiveChoice(["idle", "run"], "missing")).toBe("idle")
		expect(effectiveChoice(["idle"], undefined, true)).toBe("idle")
		expect(effectiveChoice(["run", "walk"], undefined)).toBe("run")
	})

	test("defaultSkin falls back to `default`, else the first name", () => {
		// Which skin is the *body* is a convention, and conventions are the
		// model's own declaration (see `resolveSceneSkinStack`): this fallback
		// only serves a scene that composes nothing, so it can only lean on the
		// Spine-spec `default` skin. An unannotated layered export opens on its
		// first skin and the Controls panel offers the declaration template.
		expect(defaultSkin(["default", "body_base"])).toBe("default")
		expect(defaultSkin(["variant/censored", "default"])).toBe("default")
		expect(defaultSkin(["variant/censored", "Body_Base"])).toBe(
			"variant/censored",
		)
		expect(defaultSkin(["face/a", "face/b"])).toBe("face/a")
		expect(defaultSkin([])).toBeUndefined()
	})

	test("baseAnimationNames removes overlay poses", () => {
		expect(baseAnimationNames(["idle", "blink", "run"], ["blink"])).toEqual([
			"idle",
			"run",
		])
		expect(baseAnimationNames(["idle"], [])).toEqual(["idle"])
	})
})

describe("shouldApplyPlainSkin", () => {
	test("stands down while a scene composes layers", () => {
		// The reported bug: a frame after a correct composite mount, this effect
		// applied the plain fallback skin and replaced the composite — one layer
		// missing until anything re-composed (an animation switch, a skin chip).
		// Its fallback is the body skin, which is also what the composite is
		// built on, so the model looked like it had lost a whole layer.
		expect(
			shouldApplyPlainSkin({
				ready: true,
				skin: "Skin_base",
				modelJson: undefined,
				composedLayers: 4,
			}),
		).toBe(false)
	})

	test("stands down even when the stack is down to one layer", () => {
		// A single-layer stack is still the stack's business: the stack path also
		// resets the slots to the setup pose, which one `setSkin` would not.
		expect(
			shouldApplyPlainSkin({
				ready: true,
				skin: "Skin_base",
				modelJson: undefined,
				composedLayers: 1,
			}),
		).toBe(false)
	})

	test("applies the plain skin for a single-skin export", () => {
		expect(
			shouldApplyPlainSkin({
				ready: true,
				skin: "default",
				modelJson: undefined,
				composedLayers: 0,
			}),
		).toBe(true)
	})

	test("never applies it before the player is ready or for an EX scene", () => {
		const base = {
			skin: "default",
			modelJson: undefined,
			composedLayers: 0,
		} as const
		expect(shouldApplyPlainSkin({ ...base, ready: false })).toBe(false)
		expect(
			shouldApplyPlainSkin({
				...base,
				ready: true,
				modelJson: "model0.json",
			}),
		).toBe(false)
		expect(
			shouldApplyPlainSkin({ ...base, ready: true, skin: undefined }),
		).toBe(false)
	})
})
