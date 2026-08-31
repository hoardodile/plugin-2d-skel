import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { ListEmptyRow } from "@hoardodile/ui/components/list-empty-row"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Separator } from "@hoardodile/ui/components/separator"
import { TagChip } from "@hoardodile/ui/components/tag-chip"
import type { ReactNode } from "react"
import { useTranslation } from "../i18n"
import type { EngineHitAreaItem } from "./EngineHitAreasTab"

export type DragonBonesControlsTabProps = {
	readonly armatures: readonly string[]
	readonly animations: readonly string[]
	readonly skins: readonly string[]
	readonly armature: string | undefined
	readonly animation: string | undefined
	readonly skin: string | undefined
	readonly onArmatureChange: (name: string) => void
	readonly onAnimationChange: (name: string) => void
	readonly onSkinChange: (name: string) => void
	readonly hitAreas: readonly EngineHitAreaItem[]
	readonly onHit: (name: string) => void
}

/**
 * The DragonBones Controls tab: armature select (when several), animation
 * select, skins and interactive hit areas, each block dropped entirely when
 * it has no entries.
 */
export function DragonBonesControlsTab(props: DragonBonesControlsTabProps) {
	const {
		armatures,
		animations,
		skins,
		armature,
		animation,
		skin,
		onArmatureChange,
		onAnimationChange,
		onSkinChange,
		hitAreas,
		onHit,
	} = props
	const { t } = useTranslation()

	const sections: ReactNode[] = []
	if (armatures.length > 1) {
		sections.push(
			<section key="armatures" className="flex flex-col gap-2">
				<SectionLabel size="xs">
					{t("scene")} · {armatures.length}
				</SectionLabel>
				<DropdownSelect
					value={armature ?? ""}
					onValueChange={onArmatureChange}
					options={armatures.map((name) => ({ value: name, label: name }))}
					triggerClassName="self-start text-xs text-foreground"
					aria-label={t("scene")}
					data-testid="dragonbones-armature-select"
				/>
			</section>,
		)
	}
	if (animations.length > 0) {
		sections.push(
			<section key="animations" className="flex flex-col gap-2">
				<SectionLabel size="xs">
					{t("animations")} · {animations.length}
				</SectionLabel>
				<DropdownSelect
					value={animation ?? ""}
					onValueChange={onAnimationChange}
					options={animations.map((name) => ({ value: name, label: name }))}
					triggerClassName="self-start text-xs text-foreground"
					aria-label={t("animation")}
					data-testid="dragonbones-animation-select"
				/>
			</section>,
		)
	}
	if (skins.length > 1) {
		sections.push(
			<section key="skins" className="flex flex-col gap-2">
				<SectionLabel size="xs">
					{t("skins")} · {skins.length}
				</SectionLabel>
				<DropdownSelect
					value={skin ?? ""}
					onValueChange={onSkinChange}
					options={skins.map((name) => ({ value: name, label: name }))}
					triggerClassName="self-start text-xs text-foreground"
					aria-label={t("skin")}
					data-testid="dragonbones-skin-select"
				/>
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
							data-testid={`dragonbones-controls-hitarea-${area.name}`}
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
		if (index > 0) blocks.push(<Separator key={`sep-${index}`} size="hairline" />)
		blocks.push(section)
	})

	return <div className="flex flex-col gap-3">{blocks}</div>
}
