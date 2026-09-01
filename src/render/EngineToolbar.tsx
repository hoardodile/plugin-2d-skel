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

export type EngineToolbarProps = {
	readonly visible: boolean
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

	const onTransform = (shown: boolean) =>
		shown ? "opacity-100 pointer-events-auto" : "pointer-events-none opacity-0"

	return (
		<TooltipProvider>
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
		</TooltipProvider>
	)
}
