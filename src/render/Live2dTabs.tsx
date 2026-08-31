import { Button } from "@hoardodile/ui/components/button"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { ListEmptyRow } from "@hoardodile/ui/components/list-empty-row"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Separator } from "@hoardodile/ui/components/separator"
import { TagChip } from "@hoardodile/ui/components/tag-chip"
import { type ReactNode } from "react"
import type { MotionEntry, MotionGraph } from "../core/motion-graph"
import { useTranslation } from "../i18n"
import type { EngineHitAreaItem } from "./EngineHitAreasTab"
import { pathBasename } from "./hit-areas"
import type { EngineSettings } from "./prefs"

const AUTO_PLAY_INTERVALS: readonly number[] = [3000, 5000, 8000, 12000]

export type Live2dControlsTabProps = {
	readonly graph: MotionGraph
	readonly group: string | undefined
	readonly motionIndex: number
	readonly onGroupChange: (group: string) => void
	readonly onPlayEntry: (group: string, index: number) => void
	readonly settings: EngineSettings
	readonly onSettingsChange: (patch: Partial<EngineSettings>) => void
	readonly expressions: readonly string[]
	readonly expression: string | undefined
	readonly onSelectExpression: (name: string) => void
	readonly onClearExpression: () => void
	readonly hitAreas: readonly EngineHitAreaItem[]
	readonly onHit: (name: string) => void
}

/**
 * The merged Controls tab for Live2D: motions, expressions and hit areas in
 * one scrollable column. Each selectable action (a motion entry, an
 * expression, an interactive hit area) is a wrapping tag chip instead of a
 * full-width row, so the list takes a fraction of the vertical space. The
 * four sections are parted by hairlines and labelled with SectionLabel; a
 * section with zero items is dropped entirely (label, content and its
 * separator). The Playback section (auto-play / random) sits at the top, then
 * the motions block: the group selector is a wrapping chip row of its own so
 * every group stays visible even when a model declares many of them, and the
 * motion list beneath it is headed by the selected group's name.
 */
export function Live2dControlsTab(props: Live2dControlsTabProps) {
	const {
		graph,
		group,
		motionIndex,
		onGroupChange,
		onPlayEntry,
		settings,
		onSettingsChange,
		expressions,
		expression,
		onSelectExpression,
		onClearExpression,
		hitAreas,
		onHit,
	} = props
	const { t } = useTranslation()
	const groups = Object.keys(graph)
	const entries = group === undefined ? [] : (graph[group] ?? [])
	const indexed = entries.map((entry, index) => ({ entry, index }))
	const count = groups.reduce((sum, key) => sum + (graph[key]?.length ?? 0), 0)
	const hasMotions = count > 0
	const hasPlayback = entries.length > 0
	const hasExpressions = expressions.length > 0
	const hasHit = hitAreas.length > 0

	return (
		<div className="flex flex-col gap-3">
			{hasPlayback ? (
				<>
					<section className="flex flex-col gap-2">
						<SectionLabel size="xs">{t("playback")}</SectionLabel>
						<div className="flex flex-wrap items-center gap-1.5">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								active={settings.autoPlay}
								onClick={() => onSettingsChange({ autoPlay: !settings.autoPlay })}
								aria-label={t("autoPlay")}
								data-testid="live2d-autoplay-toggle"
							>
								{settings.autoPlay ? t("autoPlayOn") : t("autoPlay")}
							</Button>
							{settings.autoPlay ? (
								<>
									<DropdownSelect
										value={settings.autoPlayMode}
										onValueChange={(value) =>
											onSettingsChange({
												autoPlayMode: value as EngineSettings["autoPlayMode"],
											})
										}
										options={[
											{ value: "sequential", label: t("sequential") },
											{ value: "shuffle", label: t("shuffle") },
										]}
										triggerClassName="text-xs text-foreground"
										aria-label={t("autoPlayMode")}
										data-testid="live2d-autoplay-mode"
									/>
									<DropdownSelect
										value={String(settings.autoPlayIntervalMs)}
										onValueChange={(value) =>
											onSettingsChange({
												autoPlayIntervalMs: Number(value),
											})
										}
										options={AUTO_PLAY_INTERVALS.map((ms) => ({
											value: String(ms),
											label: t("intervalSeconds", { seconds: ms / 1000 }),
										}))}
										triggerClassName="text-xs text-foreground"
										aria-label={t("interval")}
										data-testid="live2d-autoplay-interval"
									/>
								</>
							) : null}
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={() =>
									onPlayEntry(
										group ?? "",
										Math.floor(Math.random() * entries.length),
									)
								}
								aria-label={t("random")}
								data-testid="live2d-random"
							>
								{t("random")}
							</Button>
						</div>
					</section>
					{hasMotions || hasExpressions || hasHit ? (
						<Separator size="hairline" />
					) : null}
				</>
			) : null}

			{hasMotions ? (
				<>
					<section className="flex flex-col gap-2">
						<SectionLabel size="xs">
							{t("motions")} · {count}
						</SectionLabel>
						<div className="flex flex-wrap gap-1.5">
							{groups.map((name) => (
								<TagChip
									key={name}
									display="button"
									active={group === name}
									onClick={() => onGroupChange(name)}
									data-testid={`live2d-motion-group-${name}`}
								>
									{name}
								</TagChip>
							))}
						</div>
						{group !== undefined ? (
							<SectionLabel size="xs">{group}</SectionLabel>
						) : null}
						{entries.length === 0 ? (
							<ListEmptyRow className="text-xs">{t("noMotions")}</ListEmptyRow>
						) : (
							<div className="flex flex-wrap gap-1.5">
								{indexed.map(({ entry, index }) => (
									<TagChip
										key={`${entry.name ?? entry.file ?? index}-${index}`}
										display="button"
										active={index === motionIndex}
										onClick={() => onPlayEntry(group ?? "", index)}
										suffix={entrySuffix(entry, t)}
										data-testid={`live2d-motion-entry-${index}`}
									>
										{labelOf(entry)}
									</TagChip>
								))}
							</div>
						)}
					</section>
					{hasExpressions || hasHit ? (
						<Separator size="hairline" />
					) : null}
				</>
			) : null}

			{hasExpressions ? (
				<>
					<section className="flex flex-col gap-2">
						<SectionLabel size="xs">
							{t("expressions")} · {expressions.length}
						</SectionLabel>
						<div className="flex flex-wrap gap-1.5">
							{expressions.map((name) => (
								<TagChip
									key={name}
									display="button"
									active={expression === name}
									onClick={() => onSelectExpression(name)}
									data-testid={`live2d-expression-${name}`}
								>
									{name}
								</TagChip>
							))}
							<TagChip
								display="button"
								active={expression === undefined}
								onClick={onClearExpression}
								data-testid="live2d-expression-clear"
							>
								{t("default")}
							</TagChip>
						</div>
					</section>
					{hasHit ? <Separator size="hairline" /> : null}
				</>
			) : null}

			{hasHit ? (
				<section className="flex flex-col gap-2">
					<SectionLabel size="xs">
						{t("hit")} · {hitAreas.length}
					</SectionLabel>
					<div className="flex flex-wrap gap-1.5">
						{hitAreas.map((area) => (
							<TagChip
								key={area.name}
								display="button"
								onClick={() => onHit(area.name)}
								suffix={area.detail}
								data-testid={`engine-panel-hitarea-${area.name}`}
							>
								{area.name}
							</TagChip>
						))}
					</div>
				</section>
			) : null}
		</div>
	)
}

function labelOf(entry: MotionEntry): string {
	return entry.name ?? (entry.file === undefined ? "" : pathBasename(entry.file))
}

/** Compact muted suffix torn from the old MetaChip badge cluster — keeps the
    motion's short flags (sound/dialogue/choices/loops/next/expression) and
    duration next to the label without a full pill per badge. Returns
    `undefined` when the entry carries no metadata so the chip renders bare. */
function entrySuffix(
	entry: MotionEntry,
	t: ReturnType<typeof useTranslation>["t"],
): ReactNode | undefined {
	let hasMark = false
	const marks: ReactNode[] = []
	if (entry.sound !== undefined) {
		hasMark = true
		marks.push(
			<span key="sound" role="img" aria-label={t("hasSound")}>
				🔊
			</span>,
		)
	}
	if (entry.text !== undefined) {
		hasMark = true
		marks.push(
			<span key="text" role="img" aria-label={t("hasText")}>
				💬
			</span>,
		)
	}
	if (entry.choices.length > 0) {
		hasMark = true
		marks.push(
			<span key="choices" role="img" aria-label={t("hasChoices")}>
				▶
			</span>,
		)
	}
	if (entry.fileLoop) {
		hasMark = true
		marks.push(
			<span key="loop" role="img" aria-label={t("loops")}>
				⟳
			</span>,
		)
	}
	if (entry.next !== undefined) {
		hasMark = true
		marks.push(
			<span key="next" role="img" aria-label={t("hasNext")}>
				→
			</span>,
		)
	}
	if (entry.expression !== undefined) {
		hasMark = true
		marks.push(
			<span key="expression" role="img" aria-label={t("hasExpression")}>
				🎭
			</span>,
		)
	}
	if (entry.motionDuration !== undefined) {
		hasMark = true
		marks.push(
			<span key="duration" className="tabular-nums">
				{t("durationSeconds", { seconds: entry.motionDuration })}
			</span>,
		)
	}
	if (!hasMark) return undefined
	return <span className="flex items-center gap-1">{marks}</span>
}
