import { Icon } from "@hoardodile/ui/components/icon"
import { AltArrowLeft, AltArrowRight } from "@hoardodile/ui/icons/registry"
import { useCallback, useEffect, useRef, useState } from "react"
import type { SpineScene } from "../shared"
import { useTranslation } from "../i18n"
import { baseAnimationNames, effectiveChoice } from "./choices"
import type { ViewerScene } from "./engine"
import { EngineIconButton } from "./EngineIconButton"
import { EngineStageContent, type EnginePlugin } from "./EngineStageContent"
import { SpineControlsTab } from "./SpineControlsTab"
import { usePluginAPI } from "./hooks"
import {
	ENGINE_SETTINGS_CODEC,
	ENGINE_SETTINGS_DEFAULT,
	toSpineSettings,
	type EngineSettings,
} from "./prefs"
import { useSpinePlayer } from "./useSpinePlayer"

export type SpineHostProps = {
	readonly scene: (SpineScene & { readonly index: number }) | undefined
	readonly scenes: readonly ViewerScene[]
	readonly sceneIndex: number
	readonly selectScene: (index: number) => void
}

export function SpineHost({ scene, scenes, sceneIndex, selectScene }: SpineHostProps) {
	const api = usePluginAPI()
	const { t } = useTranslation()
	const containerRef = useRef<HTMLDivElement>(null)
	const [settings, setSettings] = api.usePref(
		"settings",
		ENGINE_SETTINGS_DEFAULT,
		ENGINE_SETTINGS_CODEC,
	)
	const updateSettings = useCallback(
		(patch: Partial<EngineSettings>) => setSettings({ ...settings, ...patch }),
		[setSettings, settings],
	)
	const spineSettings = toSpineSettings(settings)
	const [reloadKey, setReloadKey] = useState(0)
	const [animationChoice, setAnimationChoice] = useState<string>()
	const [overlayChoice, setOverlayChoice] = useState<string>()
	const [skinChoice, setSkinChoice] = useState<string>()

	useEffect(() => {
		setAnimationChoice(undefined)
		setOverlayChoice(undefined)
		setSkinChoice(undefined)
	}, [sceneIndex])

	const handleCommand = useCallback(
		(command: string) => {
			const changeCos = command.match(/^change_cos\s+(.+)$/)
			if (changeCos !== null) {
				const target = changeCos[1]
				if (target !== undefined) {
					const index = scenes.findIndex(
						(s) =>
							(s as SpineScene).modelJson === target ||
							(s as SpineScene).modelJson?.slice((s as SpineScene).modelJson!.lastIndexOf("/") + 1) === target,
					)
					if (index !== -1) selectScene(index)
				}
				return
			}
			api.logInfo("spine motion command ignored", { command })
		},
		[api, scenes, selectScene],
	)

	const player = useSpinePlayer({
		containerRef,
		scene,
		settings: spineSettings,
		animationChoice,
		overlayChoice,
		skinChoice,
		onCommand: handleCommand,
		reloadKey,
	})

	const baseNames = baseAnimationNames(player.names.animations, player.names.overlays)
	const animation = effectiveChoice(baseNames, animationChoice, scene?.modelJson !== undefined)
	const skin = effectiveChoice(player.names.skins, skinChoice)
	const overlay = effectiveChoice(player.names.overlays, overlayChoice)

	function stepAnimation(dir: 1 | -1) {
		if (baseNames.length === 0) return
		const index = baseNames.indexOf(animation ?? "")
		const next = index === -1 ? (dir === 1 ? 0 : baseNames.length - 1) : (index + dir + baseNames.length) % baseNames.length
		const name = baseNames[next]
		if (name !== undefined) setAnimationChoice(name)
	}

	const tabs: EnginePlugin["tabs"] = [
		{ key: "controls", label: t("controls"), testId: "spine-tab-controls" },
		{ key: "display", label: t("display"), testId: "spine-tab-display" },
		{ key: "info", label: t("info"), testId: "spine-tab-info" },
	]

	const plugin: EnginePlugin = {
		tabs,
		stepControls:
			baseNames.length > 1 ? (
				<>
					<EngineIconButton
						label={t("prevMotion")}
						onClick={() => stepAnimation(-1)}
						disabled={player.status !== "ready"}
						testId="spine-prev-animation"
					>
						<Icon icon={AltArrowLeft} size="md" />
					</EngineIconButton>
					<EngineIconButton
						label={t("nextMotion")}
						onClick={() => stepAnimation(1)}
						disabled={player.status !== "ready"}
						testId="spine-next-animation"
					>
						<Icon icon={AltArrowRight} size="md" />
					</EngineIconButton>
				</>
			) : undefined,
		infoFooter: (
			<div className="flex flex-col gap-2 text-xs text-muted-foreground">
				<p className="font-medium text-sm text-foreground">{t("licensing")}</p>
				<p className="leading-relaxed">{t("licensingBody")}</p>
			</div>
		),
		renderTab: (tab) => {
			if (tab === "controls") {
				return (
					<SpineControlsTab
						animations={baseNames}
						skins={player.names.skins}
						overlays={player.names.overlays}
						animation={animation}
						skin={skin}
						overlay={overlay}
						onAnimationChange={setAnimationChoice}
						onSkinChange={setSkinChoice}
						onOverlayChange={setOverlayChoice}
						hitAreas={(player.exHit?.areas ?? []).map((area) => ({
							name: area.name,
							detail: area.motion.entry ?? area.motion.group,
						}))}
						onHit={(name) => player.hit([name])}
					/>
				)
			}
			return null
		},
	}

	return (
		<EngineStageContent
			controller={player}
			scene={scene}
			scenes={scenes}
			sceneIndex={sceneIndex}
			selectScene={selectScene}
			containerRef={containerRef}
			settings={settings}
			updateSettings={updateSettings}
			plugin={plugin}
			reloadKey={reloadKey}
			setReloadKey={setReloadKey}
		/>
	)
}
