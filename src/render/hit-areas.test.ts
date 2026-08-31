import { describe, expect, test } from "vitest"
import { buildExpressionFileMap, buildHitMap } from "./hit-areas"

describe("buildHitMap", () => {
	test("reads lowercase EX `motion` hit areas", () => {
		const map = buildHitMap([
			{ name: "zuoxiong", id: "D_PSD1.310", motion: "hit" },
			{ name: "脸", id: "D_PSD1.257", motion: "表情" },
		])
		expect(map.get("zuoxiong")).toEqual({ group: "hit", entry: undefined })
		expect(map.get("脸")).toEqual({ group: "表情", entry: undefined })
	})

	test("reads PascalCase Cubism `Motion` hit areas", () => {
		const map = buildHitMap([
			{ Name: "下脚踝", Id: "HitArea_LegR2", Motion: "Tap下脚" },
			{ Name: "左胸", Id: "HitArea_BreastR", Motion: "Tap左胸:breath" },
		])
		expect(map.get("下脚踝")).toEqual({ group: "Tap下脚", entry: undefined })
		expect(map.get("左胸")).toEqual({
			group: "Tap左胸",
			entry: "breath",
		})
	})

	test("skips entries without a resolvable motion ref", () => {
		const map = buildHitMap([
			{ name: "no-motion", id: "x" },
			{ name: "empty-motion", id: "y", motion: "" },
		])
		expect(map.size).toBe(0)
	})

	test("ignores non-array input", () => {
		expect(buildHitMap(undefined).size).toBe(0)
		expect(buildHitMap({ HitAreas: [] }).size).toBe(0)
	})
})

describe("buildExpressionFileMap", () => {
	test("maps EX `name`/`file` expressions by file and basename", () => {
		const map = buildExpressionFileMap({
			expressions: [
				{ name: "idle", file: "expressions_0_file_0.json" },
				{ name: "smile", file: "sub/expressions_2_file_0.json" },
			],
		})
		expect(map.get("expressions_0_file_0.json")).toBe("idle")
		expect(map.get("smile")).toBeUndefined()
		expect(map.get("expressions_2_file_0.json")).toBe("smile")
		expect(map.get("non-existent")).toBeUndefined()
	})

	test("maps Cubism `Name`/`File` expressions", () => {
		const map = buildExpressionFileMap({
			Expressions: [{ Name: "surprised", File: "exp_surprised.exp3.json" }],
		})
		expect(map.get("exp_surprised.exp3.json")).toBe("surprised")
	})
})
