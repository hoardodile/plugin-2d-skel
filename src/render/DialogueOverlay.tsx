import { Button } from "@hoardodile/ui/components/button"
import type { MotionChoice } from "../core/motion-graph"
import type { PlayerDialogue } from "./engine"

export type DialogueOverlayProps = {
	readonly visible: boolean
	readonly dialogue: PlayerDialogue
	readonly onChoose: (choice: MotionChoice) => void
}

/**
 * EX dialogue surface: the motion's text over the model, with its choice
 * menu floating just above the toolbar. Text is content, not chrome, so
 * it stays white and unmuted.
 */
export function DialogueOverlay(props: DialogueOverlayProps) {
	const { visible, dialogue, onChoose } = props
	if (
		!visible ||
		(dialogue.text === undefined && dialogue.choices.length === 0)
	) {
		return null
	}

	return (
		<div
			className="absolute inset-x-0 bottom-14 z-30 flex flex-col items-center gap-2 px-4 max-[767px]:bottom-[calc(4.25rem+env(safe-area-inset-bottom))]"
			data-testid="live2d-dialogue"
		>
			{dialogue.text !== undefined ? (
				<div className="max-w-[min(42rem,90vw)] rounded-lg bg-black/70 px-4 py-2 text-center text-sm text-white max-[767px]:max-h-[32vh] max-[767px]:overflow-y-auto">
					{dialogue.text}
				</div>
			) : null}
			{dialogue.choices.length > 0 ? (
				<div className="flex max-w-[min(42rem,90vw)] flex-wrap items-center justify-center gap-2 max-[767px]:max-h-[32vh] max-[767px]:overflow-y-auto">
					{dialogue.choices.map((choice) => (
						<Button
							key={choice.text}
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onChoose(choice)}
							className="text-xs text-white hover:bg-white/10 max-[767px]:h-9 max-[767px]:px-3"
						>
							{choice.text}
						</Button>
					))}
				</div>
			) : null}
		</div>
	)
}
