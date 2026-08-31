import { describe, expect, test } from "vitest"
import {
	parseMotionGraphJson,
	parseMotionRef,
	preferredMotionGroup,
	selectMotion,
} from "./motion-graph"

const EX_GRAPH = {
	idle: [
		{ file: "idle", file_loop: true, weight: 1 },
		{ file: "idle2", file_loop: true, weight: 3, enabled: false },
	],
	start: [
		{
			name: "morning",
			file: "start",
			sound: "motions_start_0_sound_0.wav",
			text: "good morning",
			next_mtn: "idle",
			time_limit: { hour: 6, sustain: 120 },
			weight: 1,
		},
		{
			name: "evening",
			file: "start2",
			next_mtn: "tap:head",
			time_limit: { hour: 20, sustain: 180 },
			weight: 1,
		},
	],
	tap: [
		{
			file: "tap",
			choices: [
				{ text: "again", next_mtn: "tap" },
				{ text: "stop", next_mtn: "idle:calm" },
			],
			intimacy: { min: 20, max: 100, bonus: 1 },
		},
	],
}

describe("parseMotionGraphJson", () => {
	test("normalizes EX entries and refs", () => {
		const graph = parseMotionGraphJson(JSON.stringify(EX_GRAPH))
		expect(graph.idle?.[0]).toMatchObject({
			file: "idle",
			fileLoop: true,
			weight: 1,
		})
		expect(graph.start?.[0]).toMatchObject({
			text: "good morning",
			next: { group: "idle", entry: undefined },
			timeLimit: { hour: 6, sustainMinutes: 120 },
		})
		expect(graph.tap?.[0]?.choices).toEqual([
			{ text: "again", next: { group: "tap", entry: undefined } },
			{ text: "stop", next: { group: "idle", entry: "calm" } },
		])
	})

	test("drops malformed entries", () => {
		expect(parseMotionGraphJson(JSON.stringify({ idle: [42, "x"] }))).toEqual(
			{},
		)
	})

	test("parses Live2DViewerEX PostCommand into postCommands", () => {
		const graph = parseMotionGraphJson(
			JSON.stringify({
				tap: [
					{
						file: "tap",
						post_command: "start_mtn Idle;set_exp exp2.exp3.json",
					},
				],
			}),
		)
		expect(graph.tap?.[0]?.postCommands).toEqual([
			"start_mtn Idle",
			"set_exp exp2.exp3.json",
		])
	})

	test("splits semicolon-joined Command and PostCommand arrays", () => {
		const graph = parseMotionGraphJson(
			JSON.stringify({
				tap: [
					{
						file: "tap",
						command: ["set_exp a.exp", "parameters lock x"],
						PostCommand: "start_mtn Idle;set_exp b.exp",
					},
				],
			}),
		)
		expect(graph.tap?.[0]?.commands).toEqual([
			"set_exp a.exp",
			"parameters lock x",
		])
		expect(graph.tap?.[0]?.postCommands).toEqual([
			"start_mtn Idle",
			"set_exp b.exp",
		])
	})

	test("reads the Live2DViewerEX expression a motion switches to", () => {
		const graph = parseMotionGraphJson(
			JSON.stringify({
				attack: [
					{ file: "attack", expression: "serious" },
					{ file: "attack2", Expression: "smile" },
				],
			}),
		)
		expect(graph.attack?.[0]?.expression).toBe("serious")
		expect(graph.attack?.[1]?.expression).toBe("smile")
		expect(graph.attack?.[0]?.expression).toBeDefined()
		// An entry without an expression keeps `undefined`.
		expect(graph.attack?.[0]?.name).toBeUndefined()
	})
})

describe("preferredMotionGroup", () => {
	test("prefers an exact idle group", () => {
		expect(preferredMotionGroup(["complete", "idle", "attack"])).toBe("idle")
		expect(preferredMotionGroup(["Idle"])).toBe("Idle")
	})

	test("falls back to any idle-like group, then start, then the first", () => {
		expect(preferredMotionGroup(["complete", "idle2", "start"])).toBe("idle2")
		expect(preferredMotionGroup(["complete", "start"])).toBe("start")
		expect(preferredMotionGroup(["complete", "wedding"])).toBe("complete")
	})

	test("returns undefined for an empty list", () => {
		expect(preferredMotionGroup([])).toBeUndefined()
	})
})

describe("parseMotionRef", () => {
	test("parses group and group:entry", () => {
		expect(parseMotionRef("start")).toEqual({
			group: "start",
			entry: undefined,
		})
		expect(parseMotionRef("Menu:wordskin")).toEqual({
			group: "Menu",
			entry: "wordskin",
		})
		expect(parseMotionRef("")).toBeUndefined()
	})
})

describe("selectMotion", () => {
	test("filters disabled, intimacy and time gates", () => {
		const graph = parseMotionGraphJson(JSON.stringify(EX_GRAPH))
		const entries = graph.start ?? []
		const morning = selectMotion(entries, {
			intimacy: 0,
			hour: 7,
			random: () => 0,
		})
		expect(morning?.name).toBe("morning")

		const evening = selectMotion(entries, {
			intimacy: 0,
			hour: 21,
			random: () => 0,
		})
		expect(evening?.name).toBe("evening")
	})

	test("respects weighted random selection", () => {
		const graph = parseMotionGraphJson(
			JSON.stringify({
				idle: [
					{ file: "a", weight: 1 },
					{ file: "b", weight: 3 },
				],
			}),
		)
		const entries = graph.idle ?? []
		expect(
			selectMotion(entries, { intimacy: 0, hour: 0, random: () => 0.5 })?.file,
		).toBe("b")
	})

	test("returns undefined when no entry is allowed", () => {
		const graph = parseMotionGraphJson(
			JSON.stringify({
				tap: [{ file: "tap", intimacy: { min: 50, max: 100 } }],
			}),
		)
		expect(
			selectMotion(graph.tap ?? [], {
				intimacy: 0,
				hour: 0,
				random: () => 0,
			}),
		).toBeUndefined()
	})
})
