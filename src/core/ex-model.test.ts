import { describe, expect, test } from "vitest"
import { isExModelJsonName, parseExModelJson } from "./ex-model"

describe("ex-model", () => {
	test("matches model*.json descriptor names", () => {
		expect(isExModelJsonName("model0.json")).toBe(true)
		expect(isExModelJsonName("Model0.json")).toBe(true)
		expect(isExModelJsonName("motions_idle_0.json")).toBe(false)
	})

	test("parses a type 9 spine descriptor with raw", () => {
		const model = parseExModelJson(
			JSON.stringify({
				type: 9,
				skeleton: "skeleton_0",
				atlases: [
					{ atlas: "a", tex_names: ["x"], textures: ["x.png"] },
				],
				motions: { idle: [{ file: "idle" }] },
			}),
		)
		expect(model?.kind).toBe("spine")
		expect(model?.skeleton).toBe("skeleton_0")
		expect(model?.motionGroups).toEqual(["idle"])
		expect(model?.atlases[0]?.texNames).toEqual(["x"])
	})

	test("parses a type 10 dragonbones descriptor", () => {
		const model = parseExModelJson(
			JSON.stringify({ type: 10, skeleton: "s", atlases: [{ atlas: "a", textures: ["t.png"] }] }),
		)
		expect(model?.kind).toBe("dragonbones")
	})

	test("returns undefined for non-EX descriptors", () => {
		expect(parseExModelJson(JSON.stringify({ type: 0, model: "m.moc" }))).toBeUndefined()
		expect(parseExModelJson("not json")).toBeUndefined()
		expect(parseExModelJson(JSON.stringify({ type: 9 }))).toBeUndefined() // no skeleton
	})
})
