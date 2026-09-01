import { Button } from "@hoardodile/ui/components/button"
import { ColorPicker } from "@hoardodile/ui/components/color-picker"
import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { Label } from "@hoardodile/ui/components/label"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Separator } from "@hoardodile/ui/components/separator"
import { Slider } from "@hoardodile/ui/components/slider"
import { Switch } from "@hoardodile/ui/components/switch"
import { useTranslation } from "../i18n"
import {
	ENGINE_SOLID_COLORS,
	ENGINE_SPEEDS,
	type EngineSettings,
} from "./prefs"

export type EngineDisplayPanelProps = {
	readonly engine: "live2d" | "spine" | "dragonbones"
	readonly settings: EngineSettings
	readonly onSettingsChange: (patch: Partial<EngineSettings>) => void
	/** Current view rotation in radians (for the rotation control). */
	readonly rotation?: number
	/** Set the view rotation (radians) precisely. */
	readonly onSetRotation?: (rad: number) => void
	/** Capture the current frame as a screenshot download. */
	readonly onScreenshot?: () => void
	/** Open the crop dialog to capture and set as the resource cover. */
	readonly onCropCover?: () => void
}

const ROW =
	"flex h-control items-center justify-between gap-3 text-ui text-foreground"

/**
 * Shared viewer settings, shown in the Display tab for both engines. The
 * common group (background, speed, loop) is identical; engine-specific
 * groups (Live2D mirror/fit/gaze/volume/auto-play, Spine debug/autoplay)
 * are shown conditionally on `engine`.
 */
export function EngineDisplayPanel(props: EngineDisplayPanelProps) {
	const {
		engine,
		settings,
		onSettingsChange,
		rotation = 0,
		onSetRotation,
		onScreenshot,
		onCropCover,
	} = props
	const { t } = useTranslation()

	// Map radians to a 0–360 degree display value. Keep a full turn (360°) as
	// the distinct end of the slider instead of wrapping %360 back to 0.
	const rawDeg = Math.round((rotation * 180) / Math.PI)
	const rotationDeg =
		rawDeg % 360 === 0 && rotation > 0.001 ? 360 : ((rawDeg % 360) + 360) % 360

	const isLive2d = engine === "live2d"
	const backgroundOptions = isLive2d
		? [
				{ value: "transparent", label: t("transparent") },
				{ value: "checker", label: t("checker") },
				{ value: "solid", label: t("solid") },
			]
		: [
				{ value: "transparent", label: t("transparent") },
				{ value: "checker", label: t("checker") },
			]
	const fitOptions = [
		{ value: "fit", label: t("fitWindow") },
		{ value: "width", label: t("fitWidth") },
		{ value: "height", label: t("fitHeight") },
	]
	const speedOptions = ENGINE_SPEEDS.map((speed) => ({
		value: String(speed),
		label: `${speed}×`,
	}))

	return (
		<div className="flex w-full flex-col gap-3 text-ui text-foreground">
			<section className="flex flex-col gap-2">
				<SectionLabel size="xs">{t("view")}</SectionLabel>
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1">
						<Label className="text-xs text-muted-foreground">
							{t("background")}
						</Label>
						<DropdownSelect
							value={settings.background}
							onValueChange={(value) =>
								onSettingsChange({
									background: value as EngineSettings["background"],
								})
							}
							options={backgroundOptions}
							triggerClassName="self-start text-xs text-foreground"
							aria-label={t("background")}
							data-testid="engine-background-select"
						/>
						{isLive2d && settings.background === "solid" ? (
							<ColorPicker
								value={settings.solidColor}
								onChange={(color) => onSettingsChange({ solidColor: color })}
								presets={ENGINE_SOLID_COLORS}
								testId="engine-solid-colors"
							/>
						) : null}
					</div>
					{isLive2d ? (
						<div className="flex flex-col gap-1">
							<Label className="text-xs text-muted-foreground">
								{t("fit")}
							</Label>
							<DropdownSelect
								value={settings.fitMode}
								onValueChange={(value) =>
									onSettingsChange({
										fitMode: value as EngineSettings["fitMode"],
									})
								}
								options={fitOptions}
								triggerClassName="self-start text-xs text-foreground"
								aria-label={t("fit")}
								data-testid="engine-fit-select"
							/>
						</div>
					) : null}
					{isLive2d ? (
						<div className={ROW}>
							<span>{t("mirror")}</span>
							<Switch
								checked={settings.mirror}
								onCheckedChange={(checked) =>
									onSettingsChange({ mirror: checked })
								}
								aria-label={t("mirror")}
								data-testid="engine-mirror-toggle"
							/>
						</div>
					) : null}
					<div className={ROW}>
						<span>{t("showHitAreas")}</span>
						<Switch
							checked={settings.showHitAreas}
							onCheckedChange={(checked) =>
								onSettingsChange({ showHitAreas: checked })
							}
							aria-label={t("showHitAreas")}
							data-testid="engine-showhits-toggle"
						/>
					</div>
					{onSetRotation !== undefined ? (
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between">
								<Label className="text-xs text-muted-foreground">
									{t("rotation")}
								</Label>
								<Button
									type="button"
									variant="secondary"
									size="xs"
									onClick={() => onSetRotation(0)}
									className="text-xs text-secondary-foreground hover:text-foreground"
									aria-label={t("resetRotation")}
									data-testid="engine-reset-rotation"
								>
									{t("resetRotation")}
								</Button>
							</div>
							<Slider
								min={0}
								max={360}
								step={1}
								value={rotationDeg}
								onValueChange={(value) =>
									onSetRotation(
										((Array.isArray(value) ? (value[0] ?? 0) : value) *
											Math.PI) /
											180,
									)
								}
								className="w-full"
								aria-label={t("rotation")}
								data-testid="engine-rotation-slider"
							/>
						</div>
					) : null}
				</div>
			</section>

			{onScreenshot !== undefined || onCropCover !== undefined ? (
				<section className="flex flex-col gap-2">
					<SectionLabel size="xs">{t("capture")}</SectionLabel>
					<div className="flex gap-2">
						{onScreenshot !== undefined ? (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={onScreenshot}
								className="flex-1"
								aria-label={t("screenshot")}
								data-testid="engine-screenshot"
							>
								{t("screenshot")}
							</Button>
						) : null}
						{onCropCover !== undefined ? (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={onCropCover}
								className="flex-1"
								aria-label={t("cropCover")}
								data-testid="engine-crop-cover"
							>
								{t("cropCover")}
							</Button>
						) : null}
					</div>
				</section>
			) : null}

			<Separator size="hairline" />

			<section className="flex flex-col gap-2">
				<SectionLabel size="xs">{t("playback")}</SectionLabel>
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1">
						<Label className="text-xs text-muted-foreground">
							{t("speed")}
						</Label>
						<DropdownSelect
							value={String(settings.speed)}
							onValueChange={(value) =>
								onSettingsChange({ speed: Number(value) })
							}
							options={speedOptions}
							triggerClassName="self-start text-xs text-foreground"
							aria-label={t("speed")}
							data-testid="engine-speed-select"
						/>
					</div>
					<div className={ROW}>
						<span>{t("loop")}</span>
						<Switch
							checked={settings.loop}
							onCheckedChange={(checked) => onSettingsChange({ loop: checked })}
							aria-label={t("loop")}
							data-testid="engine-loop-toggle"
						/>
					</div>
					<div className={ROW}>
						<span>{t("autoPlay")}</span>
						<Switch
							checked={isLive2d ? settings.autoPlay : settings.autoplay}
							onCheckedChange={(checked) =>
								onSettingsChange(
									isLive2d ? { autoPlay: checked } : { autoplay: checked },
								)
							}
							aria-label={t("autoPlay")}
							data-testid="engine-autoplay-toggle"
						/>
					</div>
					{isLive2d && settings.autoPlay ? (
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
								data-testid="engine-autoplay-mode"
							/>
							<DropdownSelect
								value={String(settings.autoPlayIntervalMs)}
								onValueChange={(value) =>
									onSettingsChange({ autoPlayIntervalMs: Number(value) })
								}
								options={[3000, 5000, 8000, 12000].map((ms) => ({
									value: String(ms),
									label: t("intervalSeconds", { seconds: ms / 1000 }),
								}))}
								triggerClassName="text-xs text-foreground"
								aria-label={t("interval")}
								data-testid="engine-autoplay-interval"
							/>
						</>
					) : null}
					{isLive2d ? (
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between">
								<Label className="text-xs text-muted-foreground">
									{t("volume")}
								</Label>
								<button
									type="button"
									onClick={() => onSettingsChange({ muted: !settings.muted })}
									className="text-xs text-secondary-foreground hover:text-foreground"
									aria-label={settings.muted ? t("unmute") : t("mute")}
									data-testid="engine-mute-toggle"
								>
									{settings.muted ? t("unmute") : t("mute")}
								</button>
							</div>
							<Slider
								min={0}
								max={1}
								step={0.05}
								value={settings.volume}
								onValueChange={(value) =>
									onSettingsChange({
										volume: Array.isArray(value) ? (value[0] ?? 0) : value,
									})
								}
								className="w-full"
								aria-label={t("volume")}
								data-testid="engine-volume-slider"
							/>
						</div>
					) : null}
					{!isLive2d ? (
						<div className={ROW}>
							<span>{t("debug")}</span>
							<Switch
								checked={settings.debug}
								onCheckedChange={(checked) =>
									onSettingsChange({ debug: checked })
								}
								aria-label={t("debug")}
								data-testid="engine-debug-toggle"
							/>
						</div>
					) : null}
				</div>
			</section>
		</div>
	)
}
