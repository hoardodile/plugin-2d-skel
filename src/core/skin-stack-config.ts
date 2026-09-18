/**
 * Read a model's own layering declaration (`<model>.skins.json`).
 *
 * A model folder carries the convention it uses, so the viewer needs no
 * built-in knowledge of any toolchain: this parser turns the file into the
 * generic evaluator's input, and anything malformed degrades to "no
 * declaration" (the caller then renders a single skin and offers the template).
 */
import type {
	NameMatch,
	SkinFamilySpec,
	SkinStackSpec,
} from "../render/skin-stack-spec"

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The schema version this build understands. */
export const SKIN_STACK_SCHEMA = 1

/** What a model declares about how its skins compose. */
export type SkinStackConfig = {
	/** An exact stack, used as the mount selection. */
	readonly stack?: readonly string[]
	/** The convention: how families are matched and toggled. */
	readonly spec?: SkinStackSpec
}

/**
 * Parse one `<model>.skins.json`. Returns `undefined` when the text is not a
 * usable declaration (bad JSON, unknown schema, nothing declared), so a broken
 * annotation can never stop a model from loading.
 */
export function parseSkinStackConfig(
	text: string,
): SkinStackConfig | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return undefined
	}
	if (!isRecord(parsed)) return undefined
	if (parsed.v !== SKIN_STACK_SCHEMA) return undefined

	const stack = readStack(parsed.stack)
	const spec = readSpec(parsed.spec)
	if (stack === undefined && spec === undefined) return undefined
	return {
		...(stack !== undefined ? { stack } : {}),
		...(spec !== undefined ? { spec } : {}),
	}
}

function readStack(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) return undefined
	const names = value.filter(
		(entry): entry is string => typeof entry === "string" && entry.length > 0,
	)
	return names.length > 0 ? names : undefined
}

function readSpec(value: unknown): SkinStackSpec | undefined {
	if (!isRecord(value)) return undefined
	const id =
		typeof value.id === "string" && value.id.length > 0 ? value.id : undefined
	const marker = readMatch(value.marker)
	if (!Array.isArray(value.families)) return undefined
	const families: SkinFamilySpec[] = []
	for (const entry of value.families) {
		const family = readFamily(entry)
		if (family !== undefined) families.push(family)
	}
	if (id === undefined || marker === undefined || families.length === 0) {
		return undefined
	}
	return { id, marker, families }
}

function readFamily(value: unknown): SkinFamilySpec | undefined {
	if (!isRecord(value)) return undefined
	const id =
		typeof value.id === "string" && value.id.length > 0 ? value.id : undefined
	const match = readMatch(value.match)
	if (id === undefined || match === undefined) return undefined
	const prefer = Array.isArray(value.prefer)
		? value.prefer
				.map((entry) => readMatch(entry))
				.filter((entry): entry is NameMatch => entry !== undefined)
		: []
	return {
		id,
		match,
		cardinality: value.cardinality === "one" ? "one" : "many",
		default: value.default !== false,
		...(prefer.length > 0 ? { prefer } : {}),
	}
}

const MATCH_KEYS = ["equals", "prefix", "suffix", "contains"] as const

function readMatch(value: unknown): NameMatch | undefined {
	if (!isRecord(value)) return undefined
	const match: {
		equals?: readonly string[]
		prefix?: readonly string[]
		suffix?: readonly string[]
		contains?: readonly string[]
		regex?: string
	} = {}
	for (const key of MATCH_KEYS) {
		const patterns = value[key]
		if (!Array.isArray(patterns)) continue
		const list = patterns.filter(
			(entry): entry is string => typeof entry === "string" && entry.length > 0,
		)
		if (list.length > 0) match[key] = list
	}
	if (typeof value.regex === "string" && value.regex.length > 0) {
		match.regex = value.regex
	}
	return Object.keys(match).length > 0 ? match : undefined
}
