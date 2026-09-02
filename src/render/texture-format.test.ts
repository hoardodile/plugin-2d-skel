import { describe, expect, test } from "vitest"
import { textureVariant } from "./texture-format"

describe("textureVariant", () => {
	test("returns undefined when WebP is disabled", () => {
		expect(textureVariant(false)).toBeUndefined()
	})

	test("requests an exact-fit WebP when enabled", () => {
		expect(textureVariant(true)).toEqual({ format: "webp", fit: "exact" })
	})

	test("forwards an explicit quality override", () => {
		expect(textureVariant(true, 80)).toEqual({
			format: "webp",
			fit: "exact",
			quality: 80,
		})
	})
})
