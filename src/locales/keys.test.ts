import { describe, expect, test } from "vitest"
import de from "./de"
import en from "./en"
import es from "./es"
import ja from "./ja"
import zh from "./zh"

const LOCALES = { en, zh, ja, de, es } as const
const BASE = en

describe("render locale maps", () => {
	test("every locale defines the same keys", () => {
		const baseKeys = Object.keys(BASE).sort()
		for (const [name, map] of Object.entries(LOCALES)) {
			expect(Object.keys(map).sort(), `${name} key set`).toEqual(baseKeys)
		}
	})

	test("every locale defines webpTextures", () => {
		for (const [name, map] of Object.entries(LOCALES)) {
			expect(typeof map.webpTextures, `${name} webpTextures`).toBe("string")
		}
	})
})
