import { ListEmptyRow } from "@hoardodile/ui/components/list-empty-row"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Separator } from "@hoardodile/ui/components/separator"
import { TagChip } from "@hoardodile/ui/components/tag-chip"
import { type ReactNode, useState } from "react"
import { useTranslation } from "../i18n"
import type { EngineHitAreaItem } from "./EngineHitAreasTab"

export type SpineControlsTabProps = {
	readonly animations: readonly string[]
	readonly skins: readonly string[]
	readonly overlays: readonly string[]
	readonly animation: string | undefined
	readonly skin: string | undefined
	/**
	 * The layers currently merged into the composite skin. When present the
	 * skin chips act as add/remove toggles (`skin` is ignored); when omitted
	 * they keep their single-select behaviour for a plain Spine export.
	 */
	readonly activeSkins?: readonly string[]
	readonly overlay: string | undefined
	/**
	 * A starter layering declaration for a model that ships none, shown as a
	 * copyable template. Present only when the scene composes nothing, so the
	 * user can see why and what to write.
	 */
	readonly skinConfigTemplate?: string
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
 *
 * Skins are multi-select when the model declares its layers (the layers compose
 * into one skin, so picking one alone would leave the others' slots empty), and
 * single-select otherwise. A model that declares nothing also gets the template
 * hint, since which skin is the body is knowledge only the model can carry.
 */
export function SpineControlsTab(props: SpineControlsTabProps) {
	const {
		animations,
		skins,
		overlays,
		animation,
		skin,
		activeSkins,
		overlay,
		skinConfigTemplate,
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
					{skins.map((name) => {
						const active =
							activeSkins === undefined
								? skin === name
								: activeSkins.includes(name)
						return (
							<TagChip
								key={name}
								display="button"
								active={active}
								// A toggle button: multi-select while composing layers,
								// single-select for a plain Spine export.
								aria-pressed={active}
								onClick={() => onSkinChange(name)}
								data-testid={`spine-skin-${name}`}
							>
								{name}
							</TagChip>
						)
					})}
				</div>
				{skinConfigTemplate !== undefined && (
					<SkinConfigHint template={skinConfigTemplate} />
				)}
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

/**
 * Shown for a model that ships no layering declaration: the viewer cannot know
 * which skin is the body (that is the model's own knowledge, and it cannot
 * write into a resource folder), so it explains that and offers a starter file
 * to copy out.
 */
function SkinConfigHint({ template }: { readonly template: string }) {
	const { t } = useTranslation()
	const [copied, setCopied] = useState(false)
	const copy = () => {
		void navigator.clipboard
			?.writeText(template)
			.then(() => setCopied(true))
			.catch(() => {
				// A sandboxed frame may deny the clipboard; the template below
				// stays selectable by hand.
			})
	}
	return (
		<div
			className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-2"
			data-testid="spine-skin-config-hint"
		>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{t("skinConfigHint")}
			</p>
			<pre
				className="max-h-40 overflow-auto rounded bg-background/60 p-1.5 text-[10px] leading-snug"
				data-testid="spine-skin-config-template"
			>
				{template}
			</pre>
			<TagChip
				display="button"
				active={copied}
				onClick={copy}
				data-testid="spine-skin-config-copy"
			>
				{copied ? t("skinConfigCopied") : t("skinConfigCopy")}
			</TagChip>
		</div>
	)
}
