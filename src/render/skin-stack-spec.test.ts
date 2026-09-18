import { describe, expect, test } from "vitest"
import { parseSkinStackConfig } from "../core/skin-stack-config"
import {
	matchesName,
	matchingNames,
	type NameMatch,
	resolveSkinStack,
} from "./skin-stack-spec"

const NAMES = [
	"default",
	"body_base",
	"variant/edited",
	"layers/one",
	"face/one_Idle",
	"face/one_Smile",
]

describe("matchesName", () => {
	const cases: readonly [NameMatch, string, boolean][] = [
		[{ equals: ["Body_Base"] }, "body_base", true],
		[{ equals: ["body_base"] }, "body_base ", false],
		[{ prefix: ["LAYERS"] }, "layers/one", true],
		[{ prefix: ["layer"] }, "layers/one", true],
		[{ suffix: ["_IDLE"] }, "face/one_Idle", true],
		[{ contains: ["_IDLE"] }, "face/one_Idle", true],
		[{ regex: "^face/.+_idle$" }, "face/one_Idle", true],
		[{ regex: "(" }, "face/one_Idle", false],
		[{ equals: ["a"], prefix: ["b"] }, "c", false],
	]
	for (const [match, name, expected] of cases) {
		test(`${JSON.stringify(match)} vs ${JSON.stringify(name)}`, () => {
			expect(matchesName(match, name)).toBe(expected)
		})
	}

	test("an empty or missing match selects nothing", () => {
		expect(matchesName({}, "face/x")).toBe(false)
		expect(matchesName(undefined, "face/x")).toBe(false)
		expect(matchingNames(undefined, NAMES)).toEqual([])
	})
})

describe("resolveSkinStack", () => {
	test("a declared stack is filtered to the scene's names", () => {
		const resolved = resolveSkinStack(NAMES, {
			declaredStack: ["ghost", "body_base", "face/one_Idle"],
		})
		expect(resolved.defaultStack).toEqual(["body_base", "face/one_Idle"])
		expect(resolved.base).toBe("body_base")
		expect(resolved.applies).toBe(true)
	})

	test("an empty declaration composes nothing", () => {
		const resolved = resolveSkinStack(NAMES, { declaredStack: [] })
		expect(resolved.applies).toBe(false)
		expect(resolved.defaultStack).toEqual([])
		expect(resolved.names).toEqual(NAMES)
	})

	test("families keep scene order and prefer patterns in order", () => {
		const resolved = resolveSkinStack(NAMES, {
			spec: {
				id: "fixture",
				marker: { equals: ["body_base"] },
				families: [
					{
						id: "face",
						match: { prefix: ["face/"] },
						cardinality: "one",
						prefer: [{ suffix: ["_smile"] }, { suffix: ["_idle"] }],
					},
				],
			},
		})
		expect(resolved.families[0]?.members).toEqual([
			"face/one_Idle",
			"face/one_Smile",
		])
		// The first *pattern* wins, not the first member.
		expect(resolved.families[0]?.defaultMember).toBe("face/one_Smile")
	})

	test("a family can opt out of the default stack", () => {
		const resolved = resolveSkinStack(NAMES, {
			spec: {
				id: "fixture",
				marker: { equals: ["body_base"] },
				families: [
					{
						id: "layer",
						match: { prefix: ["layer"] },
						cardinality: "many",
						default: false,
					},
				],
			},
		})
		expect(resolved.defaultStack).toEqual(["body_base"])
		expect(resolved.families[0]?.defaultSelected).toBe(false)
	})

	test("the body skin never doubles as a family member", () => {
		const resolved = resolveSkinStack(NAMES, {
			spec: {
				id: "fixture",
				marker: { equals: ["body_base"] },
				families: [
					{
						id: "body",
						match: { prefix: ["body"] },
						cardinality: "many",
					},
				],
			},
		})
		expect(resolved.families[0]?.members).toEqual([])
		expect(resolved.defaultStack).toEqual(["body_base"])
	})
})

describe("parseSkinStackConfig", () => {
	test("reads an exact stack", () => {
		expect(
			parseSkinStackConfig('{"v":1,"stack":["body_base","face/x"]}'),
		).toEqual({ stack: ["body_base", "face/x"] })
	})

	test("reads a spec with its families and preferences", () => {
		const config = parseSkinStackConfig(
			JSON.stringify({
				v: 1,
				spec: {
					id: "acme",
					marker: { prefix: ["body_"] },
					families: [
						{
							id: "outfit",
							match: { prefix: ["outfit/"] },
							cardinality: "one",
							prefer: [{ suffix: ["_default"] }],
						},
						{ id: "prop", match: { regex: "^prop/" }, cardinality: "many" },
					],
				},
			}),
		)
		expect(config?.spec?.id).toBe("acme")
		expect(config?.spec?.marker).toEqual({ prefix: ["body_"] })
		expect(config?.spec?.families).toEqual([
			{
				id: "outfit",
				match: { prefix: ["outfit/"] },
				cardinality: "one",
				default: true,
				prefer: [{ suffix: ["_default"] }],
			},
			{
				id: "prop",
				match: { regex: "^prop/" },
				cardinality: "many",
				default: true,
			},
		])
	})

	test("anything unusable degrades to no declaration", () => {
		for (const text of [
			"not json",
			"[]",
			'{"v":2,"stack":["a"]}',
			'{"v":1}',
			'{"v":1,"stack":[]}',
			'{"v":1,"spec":{"marker":{"equals":["a"]},"families":[]}}',
			'{"v":1,"spec":{"id":"x","families":[]}}',
		]) {
			expect(parseSkinStackConfig(text), text).toBeUndefined()
		}
	})

	test("a partially malformed family is dropped, not fatal", () => {
		const config = parseSkinStackConfig(
			JSON.stringify({
				v: 1,
				spec: {
					id: "x",
					marker: { equals: ["body_base"] },
					families: [
						{ match: { prefix: ["face/"] }, cardinality: "one" },
						{ id: "ok", match: { prefix: ["variant/"] }, cardinality: "one" },
					],
				},
			}),
		)
		expect(config?.spec?.families.map((family) => family.id)).toEqual(["ok"])
	})
})
