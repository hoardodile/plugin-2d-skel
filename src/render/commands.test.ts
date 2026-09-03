import { describe, expect, test } from "vitest"
import { parseMotionGraph } from "../core/motion-graph"
import {
	applySkinCommand,
	fallbackSkinStack,
	nextExpressionName,
	parseExCommand,
	parseSkinCommand,
	skinStackFromMotionGraph,
} from "./commands"

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

describe("parseSkinCommand", () => {
	test("parses set_skins / add_skins / remove_skins lists", () => {
		expect(parseSkinCommand("set_skins skin_base")).toEqual({
			kind: "setSkins",
			skins: ["skin_base"],
		})
		expect(
			parseSkinCommand("add_skins breast/Unedited,decorations/acc,face/idle"),
		).toEqual({
			kind: "addSkins",
			skins: ["breast/Unedited", "decorations/acc", "face/idle"],
		})
		expect(parseSkinCommand("remove_skins face/a, face/b,face/c ")).toEqual({
			kind: "removeSkins",
			skins: ["face/a", "face/b", "face/c"],
		})
	})

	test("leaves unrelated commands to the caller", () => {
		expect(parseSkinCommand("start_mtn Idle")).toEqual({
			kind: "unknown",
			raw: "start_mtn Idle",
		})
	})

	test("is case-insensitive", () => {
		expect(parseSkinCommand("SET_SKINS base")).toEqual({
			kind: "setSkins",
			skins: ["base"],
		})
	})
})

describe("applySkinCommand", () => {
	const base = ["skin_base", "breast/Unedited", "decorations/acc"]

	test("set_skins replaces the stack", () => {
		expect(
			applySkinCommand(base, { kind: "setSkins", skins: ["other"] }),
		).toEqual(["other"])
	})

	test("add_skins appends missing names without duplicating", () => {
		expect(
			applySkinCommand(base, {
				kind: "addSkins",
				skins: ["face/idle", "decorations/acc"],
			}),
		).toEqual(["skin_base", "breast/Unedited", "decorations/acc", "face/idle"])
	})

	test("remove_skins drops the named layers", () => {
		expect(
			applySkinCommand(base, {
				kind: "removeSkins",
				skins: ["breast/Unedited"],
			}),
		).toEqual(["skin_base", "decorations/acc"])
	})

	test("an unknown command leaves the stack unchanged", () => {
		const stack: readonly string[] = ["a"]
		expect(applySkinCommand(stack, { kind: "unknown", raw: "x" })).toBe(stack)
	})
})

describe("skinStackFromMotionGraph", () => {
	test("derives the composite stack from a start entry's set_skins+add_skins", () => {
		const graph = parseMotionGraph({
			start: [
				{
					command:
						"set_skins skin_base;add_skins breast/Unedited,decorations/acc,face/idle",
				},
			],
			idle: [{ file: "idle" }],
		})
		expect(skinStackFromMotionGraph(graph)).toEqual([
			"skin_base",
			"breast/Unedited",
			"decorations/acc",
			"face/idle",
		])
	})

	test("prefers start, then idles, then any other group", () => {
		const withStart = parseMotionGraph({
			start: [{ command: "set_skins baseStart" }],
			idle: [{ command: "set_skins baseIdle" }],
		})
		expect(skinStackFromMotionGraph(withStart)).toEqual(["baseStart"])

		const withoutStart = parseMotionGraph({
			tap: [{ command: "set_skins baseTap" }],
			idle: [{ command: "set_skins baseIdle" }],
		})
		expect(skinStackFromMotionGraph(withoutStart)).toEqual(["baseIdle"])
	})

	test("ignores an orphan add_skins (no set_skins seeds the stack)", () => {
		const graph = parseMotionGraph({
			idle: [{ command: "add_skins decorations/acc" }],
		})
		expect(skinStackFromMotionGraph(graph)).toBeUndefined()
	})

	test("returns undefined when no group declares a skin stack", () => {
		expect(
			skinStackFromMotionGraph(parseMotionGraph({ idle: [{ file: "idle" }] })),
		).toBeUndefined()
	})
})

describe("fallbackSkinStack", () => {
	test("prefers skin_base, then default, then the first scene skin", () => {
		expect(fallbackSkinStack(["default", "skin_base"])).toEqual(["skin_base"])
		expect(fallbackSkinStack(["default", "face/idle"])).toEqual(["default"])
		expect(fallbackSkinStack(["face/a", "face/b"])).toEqual(["face/a"])
	})

	test("returns an empty stack for an empty scene skin list", () => {
		expect(fallbackSkinStack([])).toEqual([])
	})
})
