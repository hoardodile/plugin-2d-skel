import { describe, expect, test } from "vitest"
import { baseAnimationNames, effectiveChoice } from "./choices"

describe("choices", () => {
	test("effectiveChoice prefers a valid choice, else idle, else first", () => {
		expect(effectiveChoice(["idle", "run"], "run")).toBe("run")
		expect(effectiveChoice(["idle", "run"], "missing")).toBe("idle")
		expect(effectiveChoice(["idle"], undefined, true)).toBe("idle")
		expect(effectiveChoice(["run", "walk"], undefined)).toBe("run")
	})

	test("baseAnimationNames removes overlay poses", () => {
		expect(baseAnimationNames(["idle", "blink", "run"], ["blink"])).toEqual([
			"idle",
			"run",
		])
		expect(baseAnimationNames(["idle"], [])).toEqual(["idle"])
	})
})
