// @vitest-environment node
import { describe, expect, test } from "vitest"
import { scaledSoundVolume } from "./sound"

describe("scaledSoundVolume", () => {
	test("multiplies the entry volume by the viewer volume", () => {
		expect(scaledSoundVolume(0.5, { volume: 0.8, muted: false })).toBeCloseTo(
			0.4,
		)
	})

	test("mutes regardless of the other values", () => {
		expect(scaledSoundVolume(0.5, { volume: 0.8, muted: true })).toBe(0)
	})

	test("clamps combined volume to the browser range", () => {
		expect(scaledSoundVolume(2, { volume: 1, muted: false })).toBe(1)
		expect(scaledSoundVolume(-1, { volume: 1, muted: false })).toBe(0)
	})
})
