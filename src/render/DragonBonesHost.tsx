import { Icon } from "@hoardodile/ui/components/icon"
import { AltArrowLeft, AltArrowRight } from "@hoardodile/ui/icons/registry"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "../i18n"
import type { DragonBonesScene } from "../shared"
import { effectiveChoice } from "./choices"
import { DragonBonesControlsTab } from "./DragonBonesControlsTab"
import { EngineIconButton } from "./EngineIconButton"
import { type EnginePlugin, EngineStageContent } from "./EngineStageContent"
import type { ViewerScene } from "./engine"
import { usePluginAPI } from "./hooks"
import {
	ENGINE_SETTINGS_CODEC,
	ENGINE_SETTINGS_DEFAULT,
	type EngineSettings,
	toSpineSettings,
} from "./prefs"
import { useDragonBonesPlayer } from "./useDragonBonesPlayer"

export type DragonBonesHostProps = {
	readonly scene: (DragonBonesScene & { readonly index: number }) | undefined
	readonly scenes: readonly ViewerScene[]
	readonly sceneIndex: number
	readonly selectScene: (index: number) => void
}

export function DragonBonesHost({
	scene,
	scenes,
	sceneIndex,
	selectScene,
}: DragonBonesHostProps) {
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
	const dragonBonesSettings = toSpineSettings(settings)
	const [reloadKey, setReloadKey] = useState(0)
	const [animationChoice, setAnimationChoice] = useState<string>()
	const [armatureChoice, setArmatureChoice] = useState<string>()
	const [skinChoice, setSkinChoice] = useState<string>()

	useEffect(() => {
		setAnimationChoice(undefined)
		setArmatureChoice(undefined)
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
							(s as DragonBonesScene).modelJson === target ||
							(s as DragonBonesScene).modelJson?.slice(
								(s as DragonBonesScene).modelJson!.lastIndexOf("/") + 1,
							) === target,
					)
					if (index !== -1) selectScene(index)
				}
				return
			}
			api.logInfo("dragonbones motion command ignored", { command })
		},
		[api, scenes, selectScene],
	)

	const player = useDragonBonesPlayer({
		containerRef,
		scene,
		settings: dragonBonesSettings,
		animationChoice,
		armatureChoice,
		onCommand: handleCommand,
		reloadKey,
		// A tap advances to the next animation (armatures aren't hit-tested on
		// the canvas), so the model still responds to a click.
		onFallbackTap: () => stepAnimation(1),
	})

	const animation = effectiveChoice(
		player.names.animations,
		animationChoice,
		scene?.modelJson !== undefined,
	)
	const skin = effectiveChoice(player.names.skins, skinChoice)

	function stepAnimation(dir: 1 | -1) {
		const names = player.names.animations
		if (names.length === 0) return
		const index = names.indexOf(animation ?? "")
		const next =
			index === -1
				? dir === 1
					? 0
					: names.length - 1
				: (index + dir + names.length) % names.length
		const name = names[next]
		if (name !== undefined) setAnimationChoice(name)
	}

	const tabs: EnginePlugin["tabs"] = [
		{
			key: "controls",
			label: t("controls"),
			testId: "dragonbones-tab-controls",
		},
		{ key: "display", label: t("display"), testId: "dragonbones-tab-display" },
		{ key: "info", label: t("info"), testId: "dragonbones-tab-info" },
	]

	const plugin: EnginePlugin = {
		tabs,
		stepControls:
			player.names.animations.length > 1 ? (
				<>
					<EngineIconButton
						label={t("prevMotion")}
						onClick={() => stepAnimation(-1)}
						disabled={player.status !== "ready"}
						testId="dragonbones-prev-animation"
					>
						<Icon icon={AltArrowLeft} size="md" />
					</EngineIconButton>
					<EngineIconButton
						label={t("nextMotion")}
						onClick={() => stepAnimation(1)}
						disabled={player.status !== "ready"}
						testId="dragonbones-next-animation"
					>
						<Icon icon={AltArrowRight} size="md" />
					</EngineIconButton>
				</>
			) : undefined,
		infoFooter: (
			<div className="flex flex-col gap-2 text-xs text-muted-foreground">
				<p className="font-medium text-sm text-foreground">{t("licensing")}</p>
				<p className="leading-relaxed">{t("dragonbonesLicensingBody")}</p>
			</div>
		),
		renderTab: (tab) => {
			if (tab === "controls") {
				return (
					<DragonBonesControlsTab
						armatures={player.names.armatures}
						animations={player.names.animations}
						skins={player.names.skins}
						armature={effectiveChoice(player.names.armatures, armatureChoice)}
						animation={animation}
						skin={skin}
						onArmatureChange={setArmatureChoice}
						onAnimationChange={setAnimationChoice}
						onSkinChange={setSkinChoice}
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
