import { useTranslation } from "../i18n"
import { DragonBonesHost } from "./DragonBonesHost"
import { EngineEmptyState, EngineStatusOverlay } from "./EngineOverlays"
import { Live2dHost } from "./Live2dHost"
import { SpineHost } from "./SpineHost"
import { useEngineBook } from "./useEngineBook"

/**
 * The unified engine-agnostic viewer shell. It reads the scene book and
 * routes each scene to its engine host. Each host owns the per-engine
 * player hook (so React's Rules of Hooks are respected) and hands a small
 * plugin to the single shared {@link EngineStageContent}, which renders the
 * engine-neutral chrome and delegates engine-specific tab bodies/controls.
 */
export function EngineViewer() {
	const { t } = useTranslation()
	const book = useEngineBook()

	if (book.scenes.length === 0) {
		if (book.isLoading) {
			return (
				<div className="relative h-full w-full bg-black">
					<EngineStatusOverlay label={t("loading")} />
				</div>
			)
		}
		return <EngineEmptyState />
	}

	const scene = book.scene
	if (scene?.engine === "spine") {
		return (
			<div className="relative h-full w-full">
				<SpineHost
					key={`spine-${scene.index}`}
					scene={scene}
					scenes={book.scenes}
					sceneIndex={book.sceneIndex}
					selectScene={book.selectScene}
				/>
			</div>
		)
	}
	if (scene?.engine === "dragonbones") {
		return (
			<div className="relative h-full w-full">
				<DragonBonesHost
					key={`dragonbones-${scene.index}`}
					scene={scene}
					scenes={book.scenes}
					sceneIndex={book.sceneIndex}
					selectScene={book.selectScene}
				/>
			</div>
		)
	}

	return (
		<div className="relative h-full w-full">
			<Live2dHost
				key={`live2d-${scene?.index ?? "none"}`}
				scene={scene}
				scenes={book.scenes}
				sceneIndex={book.sceneIndex}
				selectScene={book.selectScene}
			/>
		</div>
	)
}
