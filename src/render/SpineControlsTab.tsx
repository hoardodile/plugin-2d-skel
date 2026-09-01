import { ListEmptyRow } from "@hoardodile/ui/components/list-empty-row"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Separator } from "@hoardodile/ui/components/separator"
import { TagChip } from "@hoardodile/ui/components/tag-chip"
import type { ReactNode } from "react"
import { useTranslation } from "../i18n"
import type { EngineHitAreaItem } from "./EngineHitAreasTab"

export type SpineControlsTabProps = {
	readonly animations: readonly string[]
	readonly skins: readonly string[]
	readonly overlays: readonly string[]
	readonly animation: string | undefined
	readonly skin: string | undefined
	readonly overlay: string | undefined
	readonly onAnimationChange: (name: string) => void
	readonly onSkinChange: (name: string) => void
	readonly onOverlayChange: (name: string) => void
	readonly hitAreas: readonly EngineHitAreaItem[]
	readonly onHit: (name: string) => void
}

/**
 * The merged Spine Controls tab, mirroring the Live2D side panel: animations,
 * skins, overlays and interactive hit areas share one scrollable column, each
 * selectable choice being a wrapping tag chip (not a dropdown) so the list
 * takes a fraction of the vertical space. A block is dropped entirely (label,
 * content and its separator) when it has no entries; a single animation/skin
 * is left out too, since it is already the active choice.
 */
export function SpineControlsTab(props: SpineControlsTabProps) {
	const {
		animations,
		skins,
		overlays,
		animation,
		skin,
		overlay,
		onAnimationChange,
		onSkinChange,
		onOverlayChange,
		hitAreas,
		onHit,
	} = props
	const { t } = useTranslation()

	const sections: ReactNode[] = []
	if (animations.length > 0) {
		sections.push(
			<section key="animations" className="flex flex-col gap-2">
				<SectionLabel size="xs">
					{t("animations")} · {animations.length}
				</SectionLabel>
				<div className="flex flex-wrap gap-1.5">
					{animations.map((name) => (
						<TagChip
							key={name}
							display="button"
							active={animation === name}
							onClick={() => onAnimationChange(name)}
							data-testid={`spine-animation-${name}`}
						>
							{name}
						</TagChip>
					))}
				</div>
			</section>,
		)
	}
	if (skins.length > 1) {
		sections.push(
			<section key="skins" className="flex flex-col gap-2">
				<SectionLabel size="xs">
					{t("skins")} · {skins.length}
				</SectionLabel>
				<div className="flex flex-wrap gap-1.5">
					{skins.map((name) => (
						<TagChip
							key={name}
							display="button"
							active={skin === name}
							onClick={() => onSkinChange(name)}
							data-testid={`spine-skin-${name}`}
						>
							{name}
						</TagChip>
					))}
				</div>
			</section>,
		)
	}
	if (overlays.length > 0) {
		sections.push(
			<section key="overlays" className="flex flex-col gap-2">
				<SectionLabel size="xs">
					{t("overlays")} · {overlays.length}
				</SectionLabel>
				<div className="flex flex-wrap gap-1.5">
					<TagChip
						display="button"
						active={overlay === undefined || overlay === ""}
						onClick={() => onOverlayChange("")}
						data-testid="spine-overlay-none"
					>
						{t("overlayNone")}
					</TagChip>
					{overlays.map((name) => (
						<TagChip
							key={name}
							display="button"
							active={overlay === name}
							onClick={() => onOverlayChange(name)}
							data-testid={`spine-overlay-${name}`}
						>
							{name}
						</TagChip>
					))}
				</div>
			</section>,
		)
	}
	if (hitAreas.length > 0) {
		sections.push(
			<section key="hit" className="flex flex-col gap-2">
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
							data-testid={`spine-controls-hitarea-${area.name}`}
						>
							{area.name}
						</TagChip>
					))}
				</div>
			</section>,
		)
	}

	if (sections.length === 0) {
		return <ListEmptyRow className="text-xs">{t("noMotions")}</ListEmptyRow>
	}

	const blocks: ReactNode[] = []
	sections.forEach((section, index) => {
		if (index > 0)
			blocks.push(<Separator key={`sep-${index}`} size="hairline" />)
		blocks.push(section)
	})

	return <div className="flex flex-col gap-3">{blocks}</div>
}
