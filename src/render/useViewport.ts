import { isTapGesture } from "@hoardodile/ui/hooks/use-pinch-pan"
import { type RefObject, useEffect, useRef, useState } from "react"
import {
	clampZoomTransform,
	HOME,
	panViewport,
	rotateViewport,
	wheelScaleFromDelta,
	zoomViewportAt,
	clampPan,
	type ViewportPoint,
	type ViewportTransform,
	type ViewportView,
} from "./canvas-view"

/**
 * Plugin-owned viewport gesture for the canvas stage. The transform is
 * `translate(x, y) scale(scale)` with the target's center as origin — the same
 * shape the shared `usePinchPan` uses, so `player.applyViewport` stays
 * unchanged.
 *
 * A **direct-drag** surface: one pointer drags (pans) the model, two pointers
 * pinch-zoom around the midpoint, the wheel zooms around the cursor, a quick
 * press reports a tap (hit areas), and a second quick press resets. Bounded
 * pan/zoom keep the model reachable.
 */

export type ViewportOptions = {
	readonly target: RefObject<HTMLElement | null>
	readonly initial?: ViewportTransform
	readonly minScale?: number
	readonly maxScale?: number
	/** Max travel for a tap before it becomes a drag, in CSS pixels. */
	readonly tapThreshold?: number
	/** When this value changes, the viewport returns to `initial`. */
	readonly resetKey?: string | number
	/** Pan bound as a fraction of the canvas size (lets the model travel far
	 *  before the boundary so a drag stays "under the hand"). */
	readonly panExtent?: number
	/** Interaction mode: `"interact"` (model interaction, no pan) or `"move"`
	 *  (drag repositions the model). */
	readonly mode?: InteractionMode
	readonly onChange?: (next: ViewportTransform) => void
	readonly onTap?: (point: ViewportPoint) => void
	/** In "interact" mode, a one-pointer drag forwards the pointer here (the
	 *  engine applies its own interaction — e.g. Live2D gaze). */
	readonly onDrag?: (point: ViewportPoint) => void
	readonly onDoubleTap?: (point: ViewportPoint) => void
}

type InteractionMode = "interact" | "move"

/** Rotation sensitivity for Alt/Option + drag (radians per CSS px ≈ 0.29°/px),
 *  tuned so a small drag gives a subtle, precise rotation. */
const ROTATE_RAD_PER_PX = 0.005

type ActivePointer = {
	readonly id: number
	readonly x: number
	readonly y: number
	readonly startX: number
	readonly startY: number
}

type GestureSession = {
	readonly pointers: ReadonlyMap<number, ActivePointer>
	readonly start: ViewportTransform
	readonly startDistance: number
	readonly startMidpoint: ViewportPoint
	moved: boolean
}

export function useViewport(options: ViewportOptions): {
	readonly transform: ViewportTransform
	readonly reset: () => void
	readonly dragging: boolean
	/** Set the rotation (radians) precisely. */
	readonly setRotation: (rad: number) => void
} {
	const {
		target,
		initial = HOME,
		minScale = 0.25,
		maxScale = 8,
		tapThreshold = 8,
		resetKey,
		panExtent = 3,
		mode = "interact",
	} = options
	const [transform, setTransform] = useState<ViewportTransform>(initial)
	const [dragging, setDragging] = useState(false)
	const initialRef = useRef(initial)
	initialRef.current = initial
	const transformRef = useRef(transform)
	transformRef.current = transform
	const sessionRef = useRef<GestureSession | null>(null)
	const lastTapRef = useRef<{ readonly point: ViewportPoint; readonly time: number } | null>(
		null,
	)
	const boundsRef = useRef({ minScale, maxScale, tapThreshold, panExtent })
	boundsRef.current = { minScale, maxScale, tapThreshold, panExtent }

	// Keep the latest callbacks/mode on refs so the single effect below never
	// re-attaches listeners mid-gesture (the old version depended on inline
	// `onChange`/`onTap`/`onDoubleTap` functions, which re-created the effect
	// on every render and contributed to the drag jitter).
	const modeRef = useRef<InteractionMode>(mode)
	modeRef.current = mode
	const onChangeRef = useRef(options.onChange)
	onChangeRef.current = options.onChange
	const onTapRef = useRef(options.onTap)
	onTapRef.current = options.onTap
	const onDragRef = useRef(options.onDrag)
	onDragRef.current = options.onDrag
	const onDoubleTapRef = useRef(options.onDoubleTap)
	onDoubleTapRef.current = options.onDoubleTap

	function currentView(): ViewportView {
		const el = target.current
		if (el === null) return { width: 0, height: 0 }
		const rect = el.getBoundingClientRect()
		return { width: rect.width, height: rect.height }
	}

	function update(next: ViewportTransform) {
		const view = currentView()
		// Before the container has a layout size, leave the transform alone so
		// it isn't clamped to the origin on the first mount.
		const bounded =
			view.width > 0 && view.height > 0
				? clampZoomTransform(next, view, boundsRef.current)
				: next
		setTransform(bounded)
		onChangeRef.current?.(bounded)
	}

	function clearSession() {
		const el = target.current
		const session = sessionRef.current
		if (el !== null && session !== null) {
			for (const id of session.pointers.keys()) {
				try {
					el.releasePointerCapture(id)
				} catch {
					// already released
				}
			}
		}
		sessionRef.current = null
	}

	function reset() {
		clearSession()
		setDragging(false)
		update({ ...HOME })
	}

	function setRotation(rad: number) {
		update({ ...transformRef.current, rotation: rad })
	}

	useEffect(() => {
		if (resetKey === undefined) return
		update({ ...initialRef.current })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [resetKey])

	useEffect(() => {
		const currentTarget = target.current
		if (currentTarget === null) return
		const element: HTMLElement = currentTarget

		/** Wheel zoom around the cursor (clamped, bounded pan) — both modes.
		 *  Anchored on the canvas center so the model zooms IN PLACE (its
		 *  position doesn't flip when zooming out). */
		function onWheel(event: WheelEvent) {
			event.preventDefault()
			const rect = element.getBoundingClientRect()
			if (rect.width <= 0 || rect.height <= 0) return
			const nextScale = wheelScaleFromDelta(
				transformRef.current.scale,
				event.deltaY,
				boundsRef.current,
			)
			update(zoomViewportAt(transformRef.current, { x: 0, y: 0 }, nextScale, boundsRef.current))
		}

		function startPointer(event: PointerEvent): void {
			const current = transformRef.current
			const session = sessionRef.current
			if (session === null) {
				sessionRef.current = {
					pointers: new Map([[event.pointerId, activePointer(event)]]),
					start: current,
					startDistance: 0,
					startMidpoint: eventPoint(event),
					moved: false,
				}
				element.setPointerCapture(event.pointerId)
				setDragging(true)
				return
			}
			const pointers = new Map(session.pointers)
			pointers.set(event.pointerId, activePointer(event))
			const entries = [...pointers.values()]
			if (entries.length >= 2) {
				const first = entries[0]
				const second = entries[1]
				if (first !== undefined && second !== undefined) {
					sessionRef.current = {
						pointers,
						start: current,
						startDistance: distance(first, second),
						startMidpoint: midpoint(first, second),
						moved: session.moved,
					}
				}
			}
			element.setPointerCapture(event.pointerId)
		}

		function movePointer(event: PointerEvent): void {
			const session = sessionRef.current
			if (session === null) return
			const pointers = new Map(session.pointers)
			pointers.set(
				event.pointerId,
				activePointer(event, session.pointers.get(event.pointerId)),
			)
			const entries = [...pointers.values()]
			if (entries.length === 0) return

			if (entries.length === 1) {
				const pointer = entries[0]
				if (pointer === undefined) return
				const delta = { x: pointer.x - pointer.startX, y: pointer.y - pointer.startY }
				// Track "moved" so a still press fires a tap while a real drag pans.
				const moved = session.moved || movedBeyondTap(pointer, boundsRef.current.tapThreshold)
				sessionRef.current = { ...session, pointers, moved }
				// Alt/Option + drag rotates the model finely (around the center),
				// taking precedence over the per-mode drag.
				if (event.altKey) {
					const deltaRad = (pointer.x - pointer.startX) * ROTATE_RAD_PER_PX
					update(rotateViewport(session.start, deltaRad))
					return
				}
				if (modeRef.current === "interact") {
					// "Interact": a drag drives the model's own interaction (e.g.
					// Live2D gaze); no viewport pan.
					onDragRef.current?.({ x: pointer.x, y: pointer.y })
					return
				}
				update(panViewport(session.start, delta))
				return
			}

			const first = entries[0]
			const second = entries[1]
			if (first === undefined || second === undefined) return
			const ratio = distance(first, second) / Math.max(1, session.startDistance)
			// Anchor the pinch on the canvas center so zoom is in place.
			const next = zoomViewportAt(
				session.start,
				{ x: 0, y: 0 },
				session.start.scale * ratio,
				boundsRef.current,
			)
			sessionRef.current = { ...session, pointers, moved: true }
			update(next)
		}

		function endPointer(event: PointerEvent): void {
			const session = sessionRef.current
			if (session === null) return
			const wasSingle = session.pointers.size === 1
			const pointers = new Map(session.pointers)
			pointers.delete(event.pointerId)
			if (pointers.size > 0) {
				sessionRef.current = { ...session, pointers }
				return
			}
			sessionRef.current = null
			setDragging(false)
			// Taps only in "interact" mode (a still press triggers a hit area);
			// "move" mode is a repositioning drag.
			if (modeRef.current === "interact" && !session.moved && wasSingle) {
				handleTap(eventPoint(event))
			}
		}

		function cancelPointer(event: PointerEvent): void {
			const session = sessionRef.current
			if (session === null) return
			const pointers = new Map(session.pointers)
			pointers.delete(event.pointerId)
			sessionRef.current = pointers.size > 0 ? { ...session, pointers } : null
			if (pointers.size === 0) setDragging(false)
		}

		function handleTap(point: ViewportPoint): void {
			onTapRef.current?.(point)
			const now = performance.now()
			const last = lastTapRef.current
			lastTapRef.current = { point, time: now }
			if (
				last !== null &&
				now - last.time < 300 &&
				Math.hypot(point.x - last.point.x, point.y - last.point.y) < 30
			) {
				lastTapRef.current = null
				onDoubleTapRef.current?.(point)
			}
		}

		element.addEventListener("wheel", onWheel, { passive: false })
		element.addEventListener("pointerdown", startPointer)
		element.addEventListener("pointermove", movePointer)
		element.addEventListener("pointerup", endPointer)
		element.addEventListener("pointercancel", cancelPointer)
		return () => {
			element.removeEventListener("wheel", onWheel)
			element.removeEventListener("pointerdown", startPointer)
			element.removeEventListener("pointermove", movePointer)
			element.removeEventListener("pointerup", endPointer)
			element.removeEventListener("pointercancel", cancelPointer)
		}
	}, [target])

	return { transform, reset, dragging, setRotation }
}

function activePointer(event: PointerEvent, start?: ActivePointer): ActivePointer {
	const origin = start ?? eventPoint(event)
	return {
		id: event.pointerId,
		x: event.clientX,
		y: event.clientY,
		// Preserve the ORIGINAL down position across moves so the delta stays
		// cumulative. Using `origin.x` (the previous move's position) makes each
		// move's delta incremental-from-last while the pan applies it to a fixed
		// `session.start` — the source of the drag "bounce".
		startX: start?.startX ?? origin.x,
		startY: start?.startY ?? origin.y,
	}
}

function eventPoint(event: { readonly clientX: number; readonly clientY: number }): ViewportPoint {
	return { x: event.clientX, y: event.clientY }
}

function distance(a: ViewportPoint, b: ViewportPoint): number {
	return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: ViewportPoint, b: ViewportPoint): ViewportPoint {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function movedBeyondTap(pointer: ActivePointer, tapThreshold: number): boolean {
	return (
		isTapGesture(
			{ x: pointer.startX, y: pointer.startY },
			{ x: pointer.x, y: pointer.y },
			tapThreshold,
		) === false
	)
}

// Back-compat re-exports for the pre-refactor pure helpers.
export { clampPan, wheelScaleFromDelta }
