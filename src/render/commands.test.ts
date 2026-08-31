import { describe, expect, test } from "vitest"
import { nextExpressionName, parseExCommand } from "./commands"

describe("parseExCommand", () => {
	test("parses start_mtn with a group and group:entry ref", () => {
		expect(parseExCommand("start_mtn Idle")).toEqual({
			kind: "startMotion",
			ref: { group: "Idle", entry: undefined },
		})
		expect(parseExCommand("start_mtn 1 in#2:in")).toEqual({
			kind: "startMotion",
			ref: { group: "1 in#2", entry: "in" },
		})
	})

	test("parses set_exp by name and by file", () => {
		expect(parseExCommand("set_exp serious")).toEqual({
			kind: "setExpression",
			target: "serious",
		})
		expect(parseExCommand("set_exp exp2.exp3.json")).toEqual({
			kind: "setExpression",
			target: "exp2.exp3.json",
		})
	})

	test("parses next_exp", () => {
		expect(parseExCommand("next_exp")).toEqual({ kind: "nextExpression" })
	})

	test("parses mouse_tracking enable/disable", () => {
		expect(parseExCommand("mouse_tracking enable")).toEqual({
			kind: "mouseTracking",
			enabled: true,
		})
		expect(parseExCommand("mouse_tracking disable")).toEqual({
			kind: "mouseTracking",
			enabled: false,
		})
	})

	test("leaves unknown commands to the caller", () => {
		expect(parseExCommand("parameters lock x")).toEqual({
			kind: "unknown",
			raw: "parameters lock x",
		})
	})

	test("is case-insensitive and tolerant of whitespace", () => {
		expect(parseExCommand("  START_MTN  idle2  ")).toEqual({
			kind: "startMotion",
			ref: { group: "idle2", entry: undefined },
		})
	})
})

describe("nextExpressionName", () => {
	test("wraps past the end and starts at the first when unset", () => {
		const names = ["idle", "serious", "smile"]
		expect(nextExpressionName(names, "serious")).toBe("smile")
		expect(nextExpressionName(names, "smile")).toBe("idle")
		expect(nextExpressionName(names, undefined)).toBe("idle")
	})

	test("starts at the first when the current name is unknown", () => {
		expect(nextExpressionName(["a", "b"], "nope")).toBe("a")
	})

	test("returns undefined for an empty list", () => {
		expect(nextExpressionName([], undefined)).toBeUndefined()
	})
})
