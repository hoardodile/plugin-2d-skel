import { Icon } from "@hoardodile/ui/components/icon"
import { AltArrowLeft, AltArrowRight } from "@hoardodile/ui/icons/registry"
import { useCallback, useEffect, useRef, useState } from "react"
import { preferredMotionGroup } from "../core/motion-graph"
import { useTranslation } from "../i18n"
import type { Live2dScene } from "../shared"
import { EngineIconButton } from "./EngineIconButton"
import { type EnginePlugin, EngineStageContent } from "./EngineStageContent"
import type { ViewerScene } from "./engine"
import { usePluginAPI } from "./hooks"
import { Live2dControlsTab } from "./Live2dTabs"
import {
	ENGINE_SETTINGS_CODEC,
	ENGINE_SETTINGS_DEFAULT,
	type EngineSettings,
	toLive2dSettings,
} from "./prefs"
import { useLive2dPlayer } from "./useLive2dPlayer"

export type Live2dHostProps = {
	readonly scene: (Live2dScene & { readonly index: number }) | undefined
	readonly scenes: readonly ViewerScene[]
	readonly sceneIndex: number
	readonly selectScene: (index: number) => void
}

export function Live2dHost({
	scene,
	scenes,
	sceneIndex,
	selectScene,
}: Live2dHostProps) {
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
	const live2dSettings = toLive2dSettings(settings)
	const [reloadKey, setReloadKey] = useState(0)
	const [motionGroup, setMotionGroup] = useState<string>()
	const [motionIndex, setMotionIndex] = useState(0)
	const [expression, setExpression] = useState<string>()

	useEffect(() => {
		const modelJson = scene?.modelJson ?? ""
		const groups = scene?.motionGroups ?? []
		const cachedGroup = api.getCache(`group:${modelJson}`)
		const group =
			cachedGroup !== undefined && groups.includes(cachedGroup)
				? cachedGroup
				: preferredMotionGroup(groups)
		setMotionGroup(group)
		setMotionIndex(0)
	}, [sceneIndex, scene?.modelJson, scene?.motionGroups, api])

	useEffect(() => {
		const modelJson = scene?.modelJson
		if (modelJson === undefined) return
		if (motionGroup !== undefined)
			api.setCache(`group:${modelJson}`, motionGroup)
	}, [scene?.modelJson, motionGroup, api])

	const handleCommand = useCallback(
		(command: string) => {
			const changeCos = command.match(/^change_cos\s+(.+)$/)
			if (changeCos !== null) {
				const target = changeCos[1]
				if (target !== undefined) {
					const index = scenes.findIndex(
						(s) =>
							s.modelJson === target ||
							s.modelJson?.slice(s.modelJson.lastIndexOf("/") + 1) === target,
					)
					if (index !== -1) selectScene(index)
				}
				return
			}
			api.logInfo("live2d motion command ignored", { command })
		},
		[api, scenes, selectScene],
	)

	const player = useLive2dPlayer({
		containerRef,
		scene,
		settings: live2dSettings,
		onCommand: handleCommand,
		reloadKey,
	})

	useEffect(() => {
		if (player.currentExpression !== undefined)
			setExpression(player.currentExpression)
	}, [player.currentExpression])

	useEffect(() => {
		if (player.status !== "ready" || motionGroup === undefined) return
		player.playGroup(motionGroup)
	}, [player.status, motionGroup, player.playGroup])

	function playEntry(group: string, index: number) {
		setMotionIndex(index)
		player.playGroupEntry(group, index)
	}

	function stepMotion(dir: 1 | -1) {
		const group = motionGroup
		const entries = player.motionGraph[group ?? ""] ?? []
		if (group === undefined || entries.length === 0) return
		const next = (motionIndex + dir + entries.length) % entries.length
		playEntry(group, next)
	}

	function stepGroup(dir: 1 | -1) {
		const groups = scene?.motionGroups ?? []
		if (groups.length === 0) return
		const current = groups.indexOf(motionGroup ?? "")
		const index =
			current === -1 ? 0 : (current + dir + groups.length) % groups.length
		const next = groups[index]
		if (next === undefined) return
		setMotionGroup(next)
		setMotionIndex(0)
		player.playGroup(next)
	}

	function handleKeyboard(event: KeyboardEvent) {
		if (event.isComposing) return
		const target = event.target
		if (target instanceof HTMLElement) {
			const tag = target.tagName
			if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return
			if (target.isContentEditable) return
		}
		switch (event.key) {
			case " ":
				event.preventDefault()
				player.togglePause()
				break
			case "ArrowLeft":
				event.preventDefault()
				stepMotion(-1)
				break
			case "ArrowRight":
				event.preventDefault()
				stepMotion(1)
				break
			case "ArrowUp":
				event.preventDefault()
				selectScene(Math.max(0, sceneIndex - 1))
				break
			case "ArrowDown":
				event.preventDefault()
				selectScene(Math.min(scenes.length - 1, sceneIndex + 1))
				break
			case "[":
				stepGroup(-1)
				break
			case "]":
				stepGroup(1)
				break
			case "m":
			case "M":
				updateSettings({ mirror: !settings.mirror })
				break
			case "g":
			case "G":
				updateSettings({ interact: !settings.interact })
				break
			case "s":
			case "S":
				// screenshot handled in the shared shell keydown? This fires here.
				api.logInfo("live2d keyboard", { key: event.key })
				break
		}
	}

	const tabs: EnginePlugin["tabs"] = [
		{ key: "controls", label: t("controls"), testId: "live2d-tab-controls" },
		{ key: "display", label: t("display"), testId: "live2d-tab-display" },
		{ key: "info", label: t("info"), testId: "live2d-tab-info" },
	]

	const plugin: EnginePlugin = {
		tabs,
		stepControls: (
			<>
				<EngineIconButton
					label={t("prevMotion")}
					onClick={() => stepMotion(-1)}
					disabled={player.status !== "ready"}
					testId="live2d-prev-motion"
				>
					<Icon icon={AltArrowLeft} size="md" />
				</EngineIconButton>
				<EngineIconButton
					label={t("nextMotion")}
					onClick={() => stepMotion(1)}
					disabled={player.status !== "ready"}
					testId="live2d-next-motion"
				>
					<Icon icon={AltArrowRight} size="md" />
				</EngineIconButton>
			</>
		),
		onKeyDown: handleKeyboard,
		renderTab: (tab) => {
			if (tab === "controls") {
				return (
					<Live2dControlsTab
						graph={player.motionGraph}
						group={motionGroup}
						motionIndex={motionIndex}
						onGroupChange={(group) => {
							setMotionGroup(group)
							setMotionIndex(0)
							player.playGroup(group)
						}}
						onPlayEntry={playEntry}
						settings={settings}
						onSettingsChange={updateSettings}
						expressions={scene?.expressions ?? []}
						expression={expression}
						onSelectExpression={(name) => {
							setExpression(name)
							player.setExpression(name)
						}}
						onClearExpression={() => {
							setExpression(undefined)
							player.resetExpression()
						}}
						hitAreas={player.hitAreas.map((area) => ({
							name: area.name,
							detail: area.entry ?? area.group,
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
