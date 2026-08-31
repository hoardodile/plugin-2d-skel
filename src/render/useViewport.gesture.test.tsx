import { act, fireEvent, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { HOME, type ViewportPoint, type ViewportTransform } from "./canvas-view"
import { useViewport } from "./useViewport"

/**
 * jsdom (v30) ships neither `PointerEvent` nor pointer capture, so gesture
 * handlers are driven with `MouseEvent`s that carry a defined `pointerId`, and
 * capture is stubbed as a no-op on the element prototype. This exercises the
 * real `useViewport` end-to-end (direct-drag pan, tap, pinch/wheel zoom,
 * double-tap reset) through JSON DOM events. The pan-accumulation case is the
 * regression for the drag "bounce": a second pointermove must keep panning from
 * the *pointerdown* position, not reset.
 */

const noop = () => {}
if (typeof Element.prototype.setPointerCapture !== "function") {
	Element.prototype.setPointerCapture = noop
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
	Element.prototype.releasePointerCapture = noop
}

type Probe = {
	transform: ViewportTransform
	taps: ViewportPoint[]
	doubleTaps: ViewportPoint[]
	drags: ViewportPoint[]
}

function makeProbe(): Probe {
	return { transform: { ...HOME }, taps: [], doubleTaps: [], drags: [] }
}

function Harness({ mode, probe }: { mode: "interact" | "move"; probe: Probe }) {
	const ref = useRef<HTMLDivElement>(null)
	const resetRef = useRef<() => void>(() => {})
	const viewport = useViewport({
		target: ref,
		mode,
		onChange: (next) => {
			probe.transform = next
		},
		onTap: (point) => {
			probe.taps.push(point)
		},
		// Mirror the shell: in interact mode a drag drives the model interaction.
		onDrag: (point) => {
			probe.drags.push(point)
		},
		// Mirror the shell: double-tap records it and resets (not zoom).
		onDoubleTap: (point) => {
			probe.doubleTaps.push(point)
			resetRef.current()
		},
	})
	resetRef.current = viewport.reset
	return (
		<>
			<div ref={ref} data-testid="target" />
			<button type="button" data-testid="reset" onClick={() => viewport.reset()}>
				reset
			</button>
		</>
	)
}

function rect(width: number, height: number): DOMRect {
	return {
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: width,
		bottom: height,
		width,
		height,
		toJSON: () => ({}),
	} as DOMRect
}

function fire(
	el: Element,
	type: "pointerdown" | "pointermove" | "pointerup",
	id: number,
	x: number,
	y: number,
	altKey = false,
) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, altKey })
	Object.defineProperty(event, "pointerId", { value: id })
	el.dispatchEvent(event)
}

function fireWheel(el: Element, deltaY: number, x: number, y: number) {
	if (typeof WheelEvent === "function") {
		el.dispatchEvent(
			new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, clientX: x, clientY: y }),
		)
		return
	}
	const event = new MouseEvent("wheel", { bubbles: true, cancelable: true, clientX: x, clientY: y })
	Object.defineProperty(event, "deltaY", { value: deltaY })
	el.dispatchEvent(event)
}

/** click without movement — a tap. */
function tap(el: Element, id: number, x: number, y: number) {
	fire(el, "pointerdown", id, x, y)
	fire(el, "pointerup", id, x, y)
}

function mount(mode: "interact" | "move") {
	const probe = makeProbe()
	render(<Harness mode={mode} probe={probe} />)
	const el = screen.getByTestId("target")
	vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect(800, 600))
	return { probe, el }
}

beforeEach(() => {
	vi.restoreAllMocks()
})

describe("useViewport — move mode (drag pans)", () => {
	test("a drag pans and a dragged press does not tap", () => {
		const { probe, el } = mount("move")
		act(() => {
			fire(el, "pointerdown", 1, 100, 100)
			fire(el, "pointermove", 1, 150, 150)
			fire(el, "pointerup", 1, 150, 150)
		})
		expect(probe.transform).toEqual({ x: 50, y: 50, scale: 1, rotation: 0 })
		expect(probe.taps).toHaveLength(0)
	})

	test("pan ACCUMULATES across multiple moves (no bounce)", () => {
		const { probe, el } = mount("move")
		act(() => {
			fire(el, "pointerdown", 1, 100, 100)
			fire(el, "pointermove", 1, 200, 100)
			fire(el, "pointermove", 1, 300, 100)
			fire(el, "pointermove", 1, 400, 100)
			fire(el, "pointerup", 1, 400, 100)
		})
		// The pan must track the pointerdown→current delta, so a drag to +300 from
		// the down position yields x:300 (not stuck at the first move's 100).
		expect(probe.transform).toEqual({ x: 300, y: 0, scale: 1, rotation: 0 })
	})

	test("move mode does not fire a tap on a still press", () => {
		const { probe, el } = mount("move")
		act(() => tap(el, 1, 120, 120))
		expect(probe.taps).toHaveLength(0)
	})

	test("Alt+horizontal drag rotates the model (no pan)", () => {
		const { probe, el } = mount("move")
		act(() => {
			fire(el, "pointerdown", 1, 100, 100)
			fire(el, "pointermove", 1, 160, 100, true) // alt held, +60px
			fire(el, "pointerup", 1, 160, 100, true)
		})
		// rotation = 60 * ROTATE_RAD_PER_PX (0.005) = 0.3 rad; x/y untouched.
		expect(probe.transform.rotation).toBeCloseTo(0.3, 5)
		expect(probe.transform.x).toBe(0)
		expect(probe.transform.y).toBe(0)
		expect(probe.transform.scale).toBe(1)
	})
})

describe("useViewport — interact mode (drag = model interaction, no pan)", () => {
	test("a dragged press forwards the pointer and does not pan or tap", () => {
		const { probe, el } = mount("interact")
		act(() => {
			fire(el, "pointerdown", 1, 100, 100)
			fire(el, "pointermove", 1, 150, 150)
			fire(el, "pointerup", 1, 150, 150)
		})
		expect(probe.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 })
		expect(probe.taps).toHaveLength(0)
		expect(probe.drags).toHaveLength(1)
		expect(probe.drags[0]).toEqual({ x: 150, y: 150 })
	})

	test("a still click fires a tap (no drag)", () => {
		const { probe, el } = mount("interact")
		act(() => tap(el, 1, 120, 120))
		expect(probe.taps).toHaveLength(1)
		expect(probe.taps[0]).toEqual({ x: 120, y: 120 })
	})

	test("two quick clicks fire a double tap", () => {
		const { probe, el } = mount("interact")
		act(() => {
			tap(el, 1, 120, 120)
			tap(el, 2, 122, 122)
		})
		expect(probe.doubleTaps).toHaveLength(1)
	})
})

describe("useViewport — wheel zoom", () => {
	test("zooms in on scroll up", () => {
		const { probe, el } = mount("interact")
		act(() => fireWheel(el, -100, 400, 300))
		expect(probe.transform.scale).toBeGreaterThan(1)
		expect(probe.transform.scale).toBeLessThan(1.2)
		expect(probe.transform.x).toBe(0)
		expect(probe.transform.y).toBe(0)
	})

	test("clamps to the zoom range", () => {
		const { probe, el } = mount("interact")
		act(() => fireWheel(el, 10000, 400, 300))
		expect(probe.transform.scale).toBe(0.25)
		act(() => fireWheel(el, -10000, 400, 300))
		expect(probe.transform.scale).toBe(8)
	})
})

describe("useViewport — reset & double-tap", () => {
	test("reset returns to the home transform after a pan", () => {
		const { probe, el } = mount("move")
		act(() => {
			fire(el, "pointerdown", 1, 100, 100)
			fire(el, "pointermove", 1, 150, 150)
			fire(el, "pointerup", 1, 150, 150)
		})
		expect(probe.transform).toEqual({ x: 50, y: 50, scale: 1, rotation: 0 })
		act(() => fireEvent.click(screen.getByTestId("reset")))
		expect(probe.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 })
	})

	test("double-tap resets to the home transform (does not zoom)", () => {
		const { probe, el } = mount("interact")
		act(() => fireWheel(el, -120, 400, 300))
		expect(probe.transform.scale).toBeGreaterThan(1)
		act(() => {
			tap(el, 2, 120, 120)
			tap(el, 3, 122, 122)
		})
		expect(probe.doubleTaps).toHaveLength(1)
		expect(probe.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 })
	})
})
