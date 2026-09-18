import { describe, expect, test } from "vitest"
import { baseAnimationNames, defaultSkin, effectiveChoice } from "./choices"

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
