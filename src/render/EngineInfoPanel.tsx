import { useTranslation } from "../i18n"
import type { EngineScene } from "../shared"

export type EngineInfoPanelProps = {
	readonly scene: EngineScene | undefined
	/** Engine-specific info rows appended after the shared ones. */
	readonly extras?: readonly { readonly k: string; readonly v: string }[]
	/** Optional footer (shortcuts, licensing). */
	readonly footer?: React.ReactNode
}

function basename(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? filename : filename.slice(slash + 1)
}

/** Shared info tab: engine/kind/version/textures/descriptor + engine extras. */
export function EngineInfoPanel(props: EngineInfoPanelProps) {
	const { scene, extras = [], footer } = props
	const { t } = useTranslation()
	if (scene === undefined) return null

	const header =
		scene.label ??
		(scene.engine === "live2d"
			? basename(scene.modelJson)
			: basename(scene.skeleton))
	const descriptor =
		scene.engine === "live2d" ? scene.modelJson : scene.skeleton

	const rows: { readonly k: string; readonly v: string }[] = [
		{ k: t("kind"), v: t(scene.kind) },
		{ k: t("engine"), v: t(scene.engine) },
		{ k: t("textures"), v: String(scene.textures.length) },
	]
	if (scene.version !== undefined)
		rows.push({ k: t("version"), v: scene.version })
	rows.push(...extras)

	return (
		<div className="flex flex-col gap-1 text-xs text-foreground">
			<div className="mb-1 border-b border-border pb-1">
				<span className="text-sm font-medium text-foreground">{header}</span>
			</div>
			{rows.map((row) => (
				<div
					key={row.k}
					className="flex items-center justify-between gap-2 py-0.5"
				>
					<span className="text-muted-foreground">{row.k}</span>
					<span className="text-right text-foreground">{row.v}</span>
				</div>
			))}
			<div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-1">
				<span className="text-muted-foreground">{t("descriptor")}</span>
				<span className="max-w-[60%] truncate text-right text-foreground">
					{descriptor}
				</span>
			</div>
			{footer !== undefined ? (
				<div className="mt-2 border-t border-border pt-2">{footer}</div>
			) : null}
		</div>
	)
}
