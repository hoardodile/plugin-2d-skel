import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList
}

if (
	typeof Element !== "undefined" &&
	Element.prototype.getAnimations === undefined
) {
	Element.prototype.getAnimations = () => []
}
