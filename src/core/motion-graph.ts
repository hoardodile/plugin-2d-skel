/**
 * Motion graph shared by Live2DViewerEX configs and Spine EX configs.
 * `motions` is a `group -> entries[]` table; an entry may chain to the
 * next entry (`next_mtn`), gate on intimacy or time, play sound/text, or
 * present choices. This module normalizes both lowercase EX keys and
 * PascalCase Cubism keys into one shape.
 */

export type MotionChoice = {
	readonly text: string
	readonly next: MotionRef
}

export type MotionRef = {
	readonly group: string
	readonly entry: string | undefined
}

export type MotionTimeLimit = {
	readonly hour: number
	readonly sustainMinutes: number
}

export type MotionIntimacy = {
	readonly min: number
	readonly max: number
	readonly bonus?: number
}

export type MotionEntry = {
	readonly name: string | undefined
	readonly file: string | undefined
	readonly fileLoop: boolean
	readonly fadeIn: number
	readonly fadeOut: number
	readonly sound: string | undefined
	readonly soundDelay: number
	readonly soundVolume: number | undefined
	readonly text: string | undefined
	readonly textDelay: number
	readonly textDuration: number | undefined
	readonly choices: readonly MotionChoice[]
	readonly next: MotionRef | undefined
	readonly commands: readonly string[]
	/** Live2DViewerEX commands that run when the motion finishes. */
	readonly postCommands: readonly string[]
	/** Live2DViewerEX expression this motion switches to (name or file). */
	readonly expression: string | undefined
	readonly intimacy: MotionIntimacy | undefined
	readonly priority: number
	readonly interruptable: boolean
	readonly ignorable: boolean
	readonly weight: number
	readonly motionDuration: number | undefined
	readonly speed: number | undefined
	readonly blendMode: number | undefined
	readonly timeLimit: MotionTimeLimit | undefined
	readonly enabled: boolean
}

export type MotionGraph = Readonly<Record<string, readonly MotionEntry[]>>

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

function readNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (typeof value === "string" && value.length > 0) {
		const parsed = Number(value)
		if (Number.isFinite(parsed)) return parsed
	}
	return undefined
}

function readBool(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback
}

function firstString(value: unknown): string | undefined {
	if (isNonEmptyString(value)) return value
	if (Array.isArray(value)) {
		for (const entry of value) {
			if (isNonEmptyString(entry)) return entry
		}
	}
	return undefined
}

function readCommands(value: unknown): readonly string[] {
	// A single string may carry several `;`-separated commands
	// (`"start_mtn Idle;set_exp exp2.exp3.json"`); an array is already a
	// list, but each element can still be `;`-joined. Split and trim.
	const parts: string[] = []
	const raw = isNonEmptyString(value) ? [value] : Array.isArray(value) ? value : []
	for (const entry of raw) {
		if (typeof entry !== "string") continue
		for (const part of entry.split(";")) {
			const trimmed = part.trim()
			if (trimmed.length > 0) parts.push(trimmed)
		}
	}
	return parts
}

function readIntimacy(value: unknown): MotionIntimacy | undefined {
	if (!isRecord(value)) return undefined
	const min = readNumber(value.min)
	const max = readNumber(value.max)
	if (min === undefined || max === undefined) return undefined
	const bonus = readNumber(value.bonus)
	return { min, max, bonus }
}

function readTimeLimit(value: unknown): MotionTimeLimit | undefined {
	if (!isRecord(value)) return undefined
	const hour = readNumber(value.hour)
	const sustain = readNumber(value.sustain)
	if (hour === undefined || sustain === undefined) return undefined
	return { hour, sustainMinutes: sustain }
}

/** Parse a `group` or `group:entry` reference. */
export function parseMotionRef(raw: string | undefined): MotionRef | undefined {
	if (!isNonEmptyString(raw)) return undefined
	const colon = raw.indexOf(":")
	if (colon === -1) return { group: raw, entry: undefined }
	const group = raw.slice(0, colon)
	const entry = raw.slice(colon + 1)
	if (!isNonEmptyString(group)) return undefined
	return { group, entry: entry.length > 0 ? entry : undefined }
}

function readChoices(value: unknown): readonly MotionChoice[] {
	if (!Array.isArray(value)) return []
	const choices: MotionChoice[] = []
	for (const item of value) {
		if (!isRecord(item)) continue
		const text = firstString(item.text ?? item.Text)
		const next = parseMotionRef(firstString(item.next_mtn ?? item.NextMtn))
		if (text === undefined || next === undefined) continue
		choices.push({ text, next })
	}
	return choices
}

function normalizeEntry(value: unknown): MotionEntry | undefined {
	if (!isRecord(value)) return undefined
	const intimacy = readIntimacy(value.intimacy ?? value.Intimacy)
	const timeLimit = readTimeLimit(value.time_limit)
	const next = parseMotionRef(firstString(value.next_mtn ?? value.NextMtn))
	const priority = readNumber(value.priority ?? value.Priority) ?? 1
	const weight = readNumber(value.weight ?? value.Weight) ?? 1
	const enabled = readBool(value.enabled ?? value.Enabled, true)
	return {
		name: firstString(value.name ?? value.Name),
		file: firstString(value.file ?? value.File),
		fileLoop: readBool(value.file_loop ?? value.FileLoop, false),
		fadeIn: readNumber(value.fade_in ?? value.FadeIn ?? value.FadeInTime) ?? 0,
		fadeOut:
			readNumber(value.fade_out ?? value.FadeOut ?? value.FadeOutTime) ?? 0,
		sound: firstString(value.sound ?? value.Sound),
		soundDelay: readNumber(value.sound_delay ?? value.SoundDelay) ?? 0,
		soundVolume: readNumber(value.sound_volume ?? value.SoundVolume),
		text: firstString(value.text ?? value.Text),
		textDelay: readNumber(value.text_delay ?? value.TextDelay) ?? 0,
		textDuration: readNumber(value.text_duration ?? value.TextDuration),
		choices: readChoices(value.choices),
		next,
		commands: readCommands(value.command ?? value.Command),
		postCommands: readCommands(value.post_command ?? value.PostCommand),
		expression: firstString(value.expression ?? value.Expression),
		intimacy,
		priority,
		interruptable: readBool(value.interruptable ?? value.Interruptable, false),
		ignorable: readBool(value.ignorable ?? value.Ignorable, false),
		weight,
		motionDuration: readNumber(value.motion_duration ?? value.MotionDuration),
		speed: readNumber(value.speed ?? value.Speed),
		blendMode: readNumber(value.blend_mode ?? value.BlendMode),
		timeLimit,
		enabled,
	}
}

/** Parse a full `motions` table, dropping malformed entries. */
export function parseMotionGraph(value: unknown): MotionGraph {
	if (!isRecord(value)) return {}
	const graph: Record<string, MotionEntry[]> = {}
	for (const [group, entries] of Object.entries(value)) {
		if (!Array.isArray(entries)) continue
		const normalized = entries
			.map(normalizeEntry)
			.filter((entry): entry is MotionEntry => entry !== undefined)
		if (normalized.length > 0) graph[group] = normalized
	}
	return graph
}

/** Parse motion JSON text into a graph. */
export function parseMotionGraphJson(text: string): MotionGraph {
	try {
		return parseMotionGraph(JSON.parse(text))
	} catch {
		return {}
	}
}

export type MotionSelection = {
	readonly intimacy?: number
	readonly hour: number | undefined
	/** Weighted random source in `[0, 1)`. */
	readonly random: () => number
}

function intimacyAllows(
	entry: MotionEntry,
	intimacy: number | undefined,
): boolean {
	if (intimacy === undefined) return true
	const gate = entry.intimacy
	return gate === undefined || (intimacy >= gate.min && intimacy <= gate.max)
}

function timeAllows(entry: MotionEntry, hour: number | undefined): boolean {
	if (entry.timeLimit === undefined || hour === undefined) return true
	const start = entry.timeLimit.hour % 24
	const end = (start + entry.timeLimit.sustainMinutes / 60) % 24
	if (start <= end) return hour >= start && hour < end
	return hour >= start || hour < end
}

/**
 * Pick an entry from a group by weight, after the enabled/intimacy/time
 * gates. Returns `undefined` when nothing is currently allowed.
 */
export function selectMotion(
	entries: readonly MotionEntry[],
	selection: MotionSelection,
): MotionEntry | undefined {
	const eligible = entries.filter(
		(entry) =>
			entry.enabled &&
			intimacyAllows(entry, selection.intimacy) &&
			timeAllows(entry, selection.hour),
	)
	if (eligible.length === 0) return undefined

	const totalWeight = eligible.reduce(
		(sum, entry) => sum + Math.max(0, entry.weight),
		0,
	)
	if (totalWeight <= 0) {
		const index = Math.min(
			eligible.length - 1,
			Math.floor(selection.random() * eligible.length),
		)
		return eligible[index]
	}
	let cursor = selection.random() * totalWeight
	for (const entry of eligible) {
		cursor -= Math.max(0, entry.weight)
		if (cursor < 0) return entry
	}
	return eligible[eligible.length - 1]
}

/**
 * Choose the motion group to auto-play when a model opens. A model that
 * loads in the middle of a scene wants its neutral stand, not a combat or
 * greeting group — prefer `idle`/`Idle` (then any `*idle*`), then
 * `start`/`Start`, and only as a last resort the first declared group.
 */
export function preferredMotionGroup(groups: readonly string[]): string | undefined {
	if (groups.length === 0) return undefined
	const exact = groups.find((group) => /^idle$/i.test(group))
	if (exact !== undefined) return exact
	const likeIdle = groups.find((group) => /idle/i.test(group))
	if (likeIdle !== undefined) return likeIdle
	const start = groups.find((group) => /^start$/i.test(group))
	if (start !== undefined) return start
	return groups[0]
}
