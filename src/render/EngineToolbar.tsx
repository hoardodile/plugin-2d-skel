import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { Icon } from "@hoardodile/ui/components/icon"
import { Separator } from "@hoardodile/ui/components/separator"
import { TooltipProvider } from "@hoardodile/ui/components/tooltip"
import { useBelowMd } from "@hoardodile/ui/hooks/use-mobile"
import {
	Maximize,
	Pause,
	Play,
	Refresh,
	Scale,
} from "@hoardodile/ui/icons/registry"
import { useTranslation } from "../i18n"
import { EngineIconButton } from "./EngineIconButton"
import type { ViewerScene } from "./engine"

export type EngineToolbarProps = {
	readonly visible: boolean
	readonly scenes: readonly ViewerScene[]
	readonly sceneIndex: number
	readonly onSceneChange: (index: number) => void
	readonly paused: boolean
	readonly ready: boolean
	readonly onTogglePause: () => void
	readonly onRestart: () => void
	readonly onResetView: () => void
	readonly onToggleFullscreen: () => void
	/** Engine-specific controls (motion stepping / animation, skin, overlay). */
	readonly children?: React.ReactNode
}

/** Reader chrome over the canvas: common transport + a per-engine slot. */
export function EngineToolbar(props: EngineToolbarProps) {
	const {
		visible,
		scenes,
		sceneIndex,
		onSceneChange,
		paused,
		ready,
		onTogglePause,
		onRestart,
		onResetView,
		onToggleFullscreen,
		children,
	} = props
	const { t } = useTranslation()
	const below = useBelowMd()

	const sceneOptions = scenes.map((scene, index) => ({
		value: String(index),
		label: sceneLabel(scene),
	}))

	const onTransform = (shown: boolean) =>
		shown ? "opacity-100 pointer-events-auto" : "pointer-events-none opacity-0"

	return (
		<TooltipProvider>
			<>
				{scenes.length > 1 ? (
					<div
						className={`absolute left-3 z-30 top-[calc(0.75rem+env(safe-area-inset-top))] ${onTransform(visible)}`}
						data-testid="engine-scene-select"
					>
						<DropdownSelect
							value={String(sceneIndex)}
							onValueChange={(value) =>
								onSceneChange(Number.parseInt(value, 10))
							}
							options={sceneOptions}
							triggerClassName="h-control gap-1 border-0 bg-background px-2 text-xs text-foreground hover:bg-muted max-[767px]:h-9"
							aria-label={t("model")}
						/>
					</div>
				) : null}
				<div
					className={`engine-fade strip-scroll absolute inset-x-0 bottom-0 z-30 flex max-w-full items-center gap-1.5 overflow-x-auto border-t border-border bg-background px-3 py-1.5 transition-opacity duration-200 max-[767px]:justify-center max-[767px]:px-2 max-[767px]:pb-[calc(0.375rem+env(safe-area-inset-bottom))] ${onTransform(visible)}`}
					data-testid="engine-toolbar"
				>
					<EngineIconButton
						label={paused ? t("play") : t("pause")}
						onClick={onTogglePause}
						disabled={!ready}
						testId="engine-play-toggle"
					>
						<Icon icon={paused ? Play : Pause} size="md" />
					</EngineIconButton>
					<EngineIconButton
						label={t("restart")}
						onClick={onRestart}
						disabled={!ready}
						testId="engine-restart"
					>
						<Icon icon={Refresh} size="md" />
					</EngineIconButton>
					{!below ? (
						<>
							<EngineIconButton
								label={t("resetView")}
								onClick={onResetView}
								disabled={!ready}
								testId="engine-reset-view"
							>
								<Icon icon={Scale} size="md" />
							</EngineIconButton>
							<Separator
								orientation="vertical"
								size="hairline"
								className="mx-1 h-5"
							/>
							<EngineIconButton
								label={t("fullscreen")}
								onClick={onToggleFullscreen}
								testId="engine-fullscreen"
							>
								<Icon icon={Maximize} size="md" />
							</EngineIconButton>
						</>
					) : null}
					<Separator
						orientation="vertical"
						size="hairline"
						className="mx-1 h-5"
					/>
					{children}
				</div>
			</>
		</TooltipProvider>
	)
}

function basename(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? filename : filename.slice(slash + 1)
}

function sceneLabel(scene: ViewerScene): string {
	const file = "skeleton" in scene ? scene.skeleton : scene.modelJson
	return scene.label ?? basename(file)
}
