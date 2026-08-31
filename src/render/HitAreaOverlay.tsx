import { useEffect, useState, type RefObject } from "react"
import type { SpineBounds, SpineHitArea } from "./spine-hit"
import { projectSpineHitRects, type HitAreaRect } from "./hit-overlay"

/**
 * Tracks an element's layout box with a ResizeObserver, reporting the
 * untransformed CSS size (`clientWidth`/`clientHeight`). For a spine
 * container the user pan/zoom is a CSS `transform` on that same element, so
 * the layout box is the pre-transform frame the native player fits into.
 */
function useLayoutSize(
	ref: RefObject<HTMLDivElement | null>,
): { readonly width: number; readonly height: number } {
	const [size, setSize] = useState({ width: 0, height: 0 })
	useEffect(() => {
		const element = ref.current
		if (element === null) return
		const update = () => {
			setSize({ width: element.clientWidth, height: element.clientHeight })
		}
		update()
		const observer = new ResizeObserver(update)
		observer.observe(element)
		return () => observer.disconnect()
	}, [ref])
	return size
}

/**
 * The on-canvas hit-area visualisation. Renders the geometry (projected into
 * container-local CSS pixels) as labelled outlines, absolutely positioned
 * inside the engine's container so a spine container's CSS viewport transform
 * is inherited automatically. Live2D rects come pre-projected from the player
 * (which reads the pixi model); Spine rects are projected here from the EX
 * descriptor geometry. `pointer-events-none` so it never blocks taps/pan.
 */
export function HitAreaOverlay(props: {
	readonly visible: boolean
	readonly containerRef: RefObject<HTMLDivElement | null>
	readonly spine?: { readonly bounds: SpineBounds; readonly areas: readonly SpineHitArea[] }
	readonly live2d?: { readonly rects: readonly HitAreaRect[] }
	/** The current viewport transform, folded into the spine projection. */
	readonly viewport?: { readonly x: number; readonly y: number; readonly scale: number }
}) {
	const { visible, containerRef, spine, live2d, viewport } = props
	const layout = useLayoutSize(containerRef)

	let rects: readonly HitAreaRect[]
	if (spine !== undefined) {
		rects = projectSpineHitRects({
			bounds: spine.bounds,
			areas: spine.areas,
			containerWidth: layout.width,
			containerHeight: layout.height,
			viewport,
		})
	} else {
		rects = live2d?.rects ?? []
	}

	if (!visible || rects.length === 0 || layout.width <= 0 || layout.height <= 0) {
		return null
	}

	return (
		<div
			className="pointer-events-none absolute inset-0 z-10"
			aria-hidden
			data-testid="engine-hit-overlay"
		>
			{rects.map((rect) => (
				<div
					key={rect.name}
					className="absolute border border-primary bg-primary/20"
					style={{
						left: rect.x,
						top: rect.y,
						width: rect.width,
						height: rect.height,
					}}
					data-testid={`engine-hit-region-${rect.name}`}
				>
					<span className="absolute left-0.5 top-0 max-w-full truncate bg-background/80 px-1 text-tiny leading-tight text-foreground">
						{rect.name}
					</span>
				</div>
			))}
		</div>
	)
}
