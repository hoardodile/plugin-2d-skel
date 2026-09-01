import { isRecord } from "@hoardodile/sdk-web"
import { Button } from "@hoardodile/ui/components/button"
import { PillTabs } from "@hoardodile/ui/components/pill-tabs"
import { Icon } from "@hoardodile/ui/components/icon"
import { Label } from "@hoardodile/ui/components/label"
import type { ViewportTransform } from "./canvas-view"
import { useBelowSidebar } from "@hoardodile/ui/hooks/use-mobile"
import { Settings } from "@hoardodile/ui/icons/registry"
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { useTranslation } from "../i18n"
import { setResourceCover } from "./cover"
import { CoverCropDialog } from "./CoverCropDialog"
import { DialogueOverlay } from "./DialogueOverlay"
import type { PlayerController, ViewerScene } from "./engine"
import { EngineDisplayPanel } from "./EngineDisplayPanel"
import { EngineEmptyState, EngineStatusOverlay } from "./EngineOverlays"
import { EngineHitAreasTab } from "./EngineHitAreasTab"
import { EngineInfoPanel } from "./EngineInfoPanel"
import { HitAreaOverlay } from "./HitAreaOverlay"
import type { EnginePanelTabDef } from "./EnginePanel"
import { EnginePanel } from "./EnginePanel"
import { EngineToolbar } from "./EngineToolbar"
import { usePluginAPI } from "./hooks"
import { useViewport } from "./useViewport"
import type { EngineSettings } from "./prefs"

const DEFAULT_VIEWPORT: ViewportTransform = { x: 0, y: 0, scale: 1, rotation: 0 }

function readCachedViewport(raw: string | undefined): ViewportTransform {
	if (raw === undefined) return DEFAULT_VIEWPORT
	try {
		const parsed: unknown = JSON.parse(raw)
		if (!isRecord(parsed)) return DEFAULT_VIEWPORT
		if (
			typeof parsed.x !== "number" ||
			typeof parsed.y !== "number" ||
			typeof parsed.scale !== "number"
		) {
			return DEFAULT_VIEWPORT
		}
		const rotation =
			typeof parsed.rotation === "number" ? parsed.rotation : 0
		return { x: parsed.x, y: parsed.y, scale: parsed.scale, rotation }
	} catch {
		return DEFAULT_VIEWPORT
	}
}

/** Shared tab keys rendered by the shell; other tabs come from the plugin.
    The hit tab is shared for Spine (its own media-internal hit areas); Live2D
    folds hit areas into its single Controls tab instead. */
export const SHARED_TABS = {
	HIT: "hit",
	DISPLAY: "display",
	INFO: "info",
} as const

/**
 * The per-engine seam: what differs between engines. The Host builds this
 * after calling its own player hook and hands it to the shared shell, which
 * renders the engine-neutral chrome and delegates the engine-specific tab
 * bodies and quick controls here.
 */
export type EnginePlugin = {
	readonly tabs: readonly EnginePanelTabDef[]
	readonly renderTab: (tab: string) => ReactNode
	readonly stepControls?: ReactNode
	readonly infoFooter?: ReactNode
	/** Live2D keyboard shortcuts; Spine defaults to none. */
	readonly onKeyDown?: (event: KeyboardEvent) => void
	/** When a chip / render needs the resource API, it is read in the shell. */
}

export type EngineStageContentProps = {
	readonly controller: PlayerController
	readonly scene: ViewerScene | undefined
	readonly scenes: readonly ViewerScene[]
	readonly sceneIndex: number
	readonly selectScene: (index: number) => void
	readonly containerRef: RefObject<HTMLDivElement | null>
	readonly settings: EngineSettings
	readonly updateSettings: (patch: Partial<EngineSettings>) => void
	readonly plugin: EnginePlugin
	readonly reloadKey: number
	readonly setReloadKey: (updater: (key: number) => number) => void
}

/**
 * The single shared viewer shell, used by both engines. It owns the
 * viewport, canvas host, background, version chip, toolbar, dialogue,
 * status overlays and the side panel; only the engine-specific tab bodies
 * and quick controls come from the plugin.
 */
export function EngineStageContent(props: EngineStageContentProps) {
	const {
		controller,
		scene,
		scenes,
		sceneIndex,
		selectScene,
		containerRef,
		settings,
		updateSettings,
		plugin,
		setReloadKey,
	} = props
	const { t } = useTranslation()
	const api = usePluginAPI()
	const engine = controller.engine
	const rootRef = useRef<HTMLDivElement>(null)
	const [panelOpen, setPanelOpen] = useState(false)
	const [panelTab, setPanelTab] = useState<string>(() =>
		engine === "live2d" ? settings.live2dTab : settings.spineTab,
	)
	const [cropOpen, setCropOpen] = useState(false)
	const [cropImage, setCropImage] = useState<string | undefined>(undefined)
	const [cropSceneIndex, setCropSceneIndex] = useState(sceneIndex)
	const keyboardRef = useRef<(event: KeyboardEvent) => void>(() => {})
	const resetViewportRef = useRef<() => void>(() => {})
	const below = useBelowSidebar()
	const docked = !below

	useEffect(() => {
		setPanelOpen(false)
		setPanelTab(engine === "live2d" ? settings.live2dTab : settings.spineTab)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sceneIndex, engine])

	const viewportKey =
		scene === undefined
			? ""
			: scene.engine === "spine"
				? `${scene.modelJson ?? ""}:${scene.skeleton}`
				: scene.modelJson
	const viewportCacheKey = `viewport:${viewportKey}`
	const mode = settings.interactionMode

	const viewport = useViewport({
		target: containerRef,
		initial: readCachedViewport(api.getCache(viewportCacheKey)),
		resetKey: viewportKey,
		mode,
		onChange(next) {
			controller.applyViewport(next)
			api.setCache(viewportCacheKey, JSON.stringify(next))
		},
		onTap(point) {
			if (engine === "spine" && scene?.modelJson === undefined) return
			const host = containerRef.current
			if (host === null) return
			const rect = host.getBoundingClientRect()
			controller.tapAt(
				{ x: point.x - rect.left, y: point.y - rect.top },
				viewport.transform,
			)
		},
		onDrag(point) {
			// "Interact"-mode drag: Live2D gaze/drag-interaction (no pan).
			if (controller.engine === "live2d") controller.dragAt(point)
		},
		onDoubleTap() {
			// Double-click resets the view (not a zoom toggle).
			resetViewportRef.current()
		},
	})
	resetViewportRef.current = viewport.reset

	// The ACTUAL applied transform (derived from each engine's live render
	// surface) so a re-fit/snap-back is observable via data-viewport.
	const appliedViewport = controller.getAppliedViewport()

	// Apply the viewport natively in each engine's render surface.
	useEffect(() => {
		if (controller.status !== "ready") return
		controller.applyViewport(viewport.transform)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewport.transform, controller.status, settings.mirror, settings.fitMode])

	keyboardRef.current = (event: KeyboardEvent) => plugin.onKeyDown?.(event)
	useEffect(() => {
		const handler = (event: KeyboardEvent) => keyboardRef.current(event)
		window.addEventListener("keydown", handler)
		return () => window.removeEventListener("keydown", handler)
	}, [])

	if (scenes.length === 0) return <EngineEmptyState />

	function toggleFullscreen() {
		const root = rootRef.current
		if (root === null) return
		if (document.fullscreenElement === null) {
			void root.requestFullscreen().catch(() => {})
		} else {
			void document.exitFullscreen().catch(() => {})
		}
	}

	function downloadScreenshot() {
		const dataUrl = controller.capture()
		if (dataUrl === undefined) return
		const name =
			scene === undefined
				? engine === "live2d"
					? "live2d"
					: "spine"
				: (scene.label ??
					(scene.engine === "spine" || scene.engine === "dragonbones"
						? scene.skeleton
						: scene.modelJson) ??
					"model")
		const safe = name.replace(/[\\/:*?"<>|]+/g, "-")
		const link = document.createElement("a")
		link.href = dataUrl
		link.download = `${safe}.png`
		link.click()
	}

	function openCrop() {
		const dataUrl = controller.capture()
		if (dataUrl === undefined) return
		setCropImage(dataUrl)
		setCropSceneIndex(scene?.index ?? sceneIndex)
		setCropOpen(true)
	}

	function submitCover(dataUrl: string) {
		return setResourceCover(
			{ dataUrl, sceneIndex: cropSceneIndex },
			api.uploadCover,
			(message, data) => api.logWarn(message, data),
		)
	}

	const modeControl = (
		<div className="flex w-full flex-col gap-1.5 pb-1">
			<Label className="text-xs text-muted-foreground">{t("interactionMode")}</Label>
			<PillTabs
				value={mode}
				className="self-start"
				onChange={(value) => updateSettings({ interactionMode: value })}
				items={[
					{
						value: "interact",
						label: t("interactMode"),
						testId: "engine-mode-interact",
						ariaPressed: mode === "interact",
						ariaLabel: t("interactMode"),
					},
					{
						value: "move",
						label: t("moveMode"),
						testId: "engine-mode-move",
						ariaPressed: mode === "move",
						ariaLabel: t("moveMode"),
					},
				]}
			/>
			<p className="text-tiny leading-snug text-muted-foreground">
				{mode === "move" ? t("moveModeHint") : t("interactModeHint")}
			</p>
		</div>
	)

	const activeTabBody = (() => {
		if (panelTab === SHARED_TABS.DISPLAY) {
			return (
				<EngineDisplayPanel
					engine={engine}
					settings={settings}
					onSettingsChange={updateSettings}
					rotation={viewport.transform.rotation}
					onSetRotation={viewport.setRotation}
					onScreenshot={downloadScreenshot}
					onCropCover={openCrop}
				/>
			)
		}
		if (panelTab === SHARED_TABS.INFO) {
			return (
				<EngineInfoPanel
					scene={scene}
					extras={infoExtras(engine, controller, scene, t)}
					footer={plugin.infoFooter}
				/>
			)
		}
		if (panelTab === SHARED_TABS.HIT) {
			// Spine keeps the shared hit-area list; Live2D renders its own
			// hit-area chips inside the Controls tab (see Live2dHost).
			const items =
				controller.engine === "live2d"
					? controller.hitAreas.map((area) => ({
							name: area.name,
							detail: area.entry ?? area.group,
						}))
					: (controller.exHit?.areas ?? []).map((area) => ({
							name: area.name,
							detail: area.motion.entry ?? area.motion.group,
						}))
			return (
				<EngineHitAreasTab
					items={items}
					onTrigger={(name) => controller.hit([name])}
				/>
			)
		}
		// "controls" tab: the mode control sits at its very top.
		if (panelTab === "controls") {
			return (
				<>
					{modeControl}
					{plugin.renderTab("controls")}
				</>
			)
		}
		return plugin.renderTab(panelTab)
	})()

	const versionLabel =
		scene === undefined
			? undefined
			: scene.engine === "spine" || scene.engine === "dragonbones"
				? `${scene.format.toUpperCase()} · ${scene.version ?? t("version")}`
				: scene.version ?? t("version")

	return (
		<div ref={rootRef} className="relative flex h-full w-full bg-black text-white">
			<div className="relative min-w-0 flex-1">
				<div
					className={`absolute inset-0 touch-none overscroll-none ${
						mode === "move"
							? viewport.dragging
								? "cursor-grabbing"
								: "cursor-grab"
							: "cursor-default"
					} ${settings.background === "checker" ? (engine === "live2d" ? "live2d-checker" : "spine-checker") : ""}`}
					style={
						engine === "live2d" && settings.background === "solid"
							? { backgroundColor: settings.solidColor }
							: undefined
					}
					data-testid={`${engine}-canvas-host`}
					data-mode={mode}
					data-viewport={JSON.stringify(appliedViewport)}
				>
					<div ref={containerRef} className="relative h-full w-full">
						<HitAreaOverlay
							visible={settings.showHitAreas && controller.status === "ready"}
							containerRef={containerRef}
							viewport={viewport.transform}
							spine={
								controller.engine === "spine" && controller.exHit !== undefined
									? { bounds: controller.exHit.bounds, areas: controller.exHit.areas }
									: undefined
							}
							live2d={
								controller.engine === "live2d"
									? { rects: controller.hitAreaRects }
									: undefined
							}
						/>
					</div>
					{mode === "move" && controller.status === "ready" ? (
						<span
							className="pointer-events-none absolute left-1/2 z-10 top-[calc(0.75rem+env(safe-area-inset-top))] -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white/70"
							data-testid="engine-move-mode-hint"
						>
							{t("moveModeHint")}
						</span>
					) : null}
				</div>

			{scene !== undefined ? (
				<span
					className="absolute left-3 z-10 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white/70 top-[calc(0.75rem+env(safe-area-inset-top))]"
					data-testid="engine-version-chip"
				>
					{versionLabel}
				</span>
			) : null}

			<EngineToolbar
				visible
				scenes={scenes}
				sceneIndex={sceneIndex}
				onSceneChange={selectScene}
				paused={controller.paused}
				ready={controller.status === "ready"}
				onTogglePause={controller.togglePause}
				onRestart={controller.restart}
				onResetView={viewport.reset}
				onToggleFullscreen={toggleFullscreen}
			>
				{plugin.stepControls}
				{below ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							setPanelTab(
								engine === "live2d" ? settings.live2dTab : settings.spineTab,
							)
							setPanelOpen(true)
						}}
						className="ml-auto h-control shrink-0 gap-1 px-2 text-xs text-foreground hover:bg-muted"
						aria-label={t("settings")}
						data-testid="engine-open-panel"
					>
						<Icon icon={Settings} size="sm" />
						{t("settings")}
					</Button>
				) : null}
			</EngineToolbar>

				<DialogueOverlay
					visible
					dialogue={controller.dialogue}
					onChoose={(choice) => controller.choose(choice.next)}
				/>

				{controller.status === "loading" ? (
					<EngineStatusOverlay label={t("loading")} />
				) : null}
				{controller.status === "error" ? (
					<EngineStatusOverlay
						label={
							engine === "live2d" && controller.runtimeError !== undefined
								? controller.runtimeError.kind === "denied"
									? t("runtimeDenied")
									: controller.runtimeError.kind === "unavailable"
										? t("runtimeUnavailable")
										: controller.runtimeError.kind === "network"
											? t("runtimeNetwork")
											: controller.runtimeError.kind === "stale"
												? t("runtimeStale")
												: t("runtimeFailed")
								: t("loadError")
						}
						detail={
							controller.engine === "spine" || controller.engine === "dragonbones"
								? controller.errorDetail
								: undefined
						}
						actionLabel={t(
							engine === "live2d" && controller.runtimeError !== undefined
								? "runtimeRetry"
								: "restart",
						)}
						onAction={() => setReloadKey((key) => key + 1)}
					/>
				) : null}
			</div>

			<EnginePanel
				docked={docked}
				open={panelOpen}
				onClose={() => setPanelOpen(false)}
				tabs={plugin.tabs}
				tab={panelTab}
				onTabChange={(tab) => {
					setPanelTab(tab)
					updateSettings(
						engine === "live2d"
							? { live2dTab: tab as EngineSettings["live2dTab"] }
							: { spineTab: tab as EngineSettings["spineTab"] },
					)
				}}
				testId={`${engine}-panel`}
			>
				{activeTabBody}
			</EnginePanel>

			<CoverCropDialog
				open={cropOpen}
				onOpenChange={setCropOpen}
				dataUrl={cropImage ?? ""}
				submitCover={submitCover}
			/>
		</div>
	)
}

function infoExtras(
	engine: "live2d" | "spine" | "dragonbones",
	controller: PlayerController,
	scene: ViewerScene | undefined,
	t: (key: string) => string,
): readonly { readonly k: string; readonly v: string }[] {
	if (engine === "live2d" && controller.engine === "live2d") {
		const rows: { readonly k: string; readonly v: string }[] = []
		if (controller.modelInfo !== undefined) {
			rows.push({
				k: t("canvas"),
				v: `${Math.round(controller.modelInfo.canvas.width)} × ${Math.round(controller.modelInfo.canvas.height)}`,
			})
			if (controller.modelInfo.version !== undefined) {
				rows.push({ k: t("version"), v: String(controller.modelInfo.version) })
			}
			rows.push({ k: t("physics"), v: controller.modelInfo.hasPhysics ? t("yes") : t("no") })
			rows.push({ k: t("pose"), v: controller.modelInfo.hasPose ? t("yes") : t("no") })
		}
		if (controller.runtimeVersion !== undefined) {
			rows.push({ k: t("runtime"), v: controller.runtimeVersion })
		}
		return rows
	}
	if (engine === "spine" && controller.engine === "spine") {
		const rows: { readonly k: string; readonly v: string }[] = []
		if (scene?.engine === "spine") {
			rows.push({ k: t("format"), v: scene.format.toUpperCase() })
		}
		rows.push({ k: t("animations"), v: String(controller.names.animations.length) })
		rows.push({ k: t("skins"), v: String(controller.names.skins.length) })
		if (controller.exHit !== undefined) {
			rows.push({ k: t("hit"), v: String(controller.exHit.areas.length) })
		}
		if (controller.runtimeVersion !== undefined) {
			rows.push({ k: t("runtime"), v: controller.runtimeVersion })
		}
		return rows
	}
	if (engine === "dragonbones" && controller.engine === "dragonbones") {
		const rows: { readonly k: string; readonly v: string }[] = []
		if (scene?.engine === "dragonbones") {
			rows.push({ k: t("format"), v: scene.format.toUpperCase() })
		}
		if (controller.names.armatures.length > 0) {
			rows.push({ k: t("scene"), v: String(controller.names.armatures.length) })
		}
		rows.push({ k: t("animations"), v: String(controller.names.animations.length) })
		rows.push({ k: t("skins"), v: String(controller.names.skins.length) })
		if (controller.exHit !== undefined) {
			rows.push({ k: t("hit"), v: String(controller.exHit.areas.length) })
		}
		if (controller.runtimeVersion !== undefined) {
			rows.push({ k: t("runtime"), v: controller.runtimeVersion })
		}
		return rows
	}
	return []
}
