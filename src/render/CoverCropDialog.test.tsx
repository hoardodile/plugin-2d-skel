import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { CoverCropDialog } from "./CoverCropDialog"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

// The shared cropper wraps react-image-crop (canvas/geometry heavy in jsdom);
// stub it so we control the deferred render() that produces the CroppedImage.
vi.mock("@hoardodile/ui/components/image-cropper", () => ({
	ImageCropper: ({
		onCropReady,
	}: {
		onCropReady?: (render: () => Promise<unknown>) => void
	}) => {
		onCropReady?.(() =>
			Promise.resolve({
				blob: new Blob(["crop"], { type: "image/png" }),
				width: 10,
				height: 10,
				mimeType: "image/png",
			}),
		)
		return <div data-testid="ui-cropper" />
	},
}))

describe("CoverCropDialog", () => {
	test("renders the shared cropper and the dialog buttons", () => {
		render(
			<CoverCropDialog
				open
				onOpenChange={() => {}}
				dataUrl="data:image/png;base64,mem"
				submitCover={async () => ({ ok: true })}
			/>,
		)
		expect(screen.getByTestId("cover-crop-dialog")).toBeInTheDocument()
		expect(screen.getByTestId("ui-cropper")).toBeInTheDocument()
		expect(screen.getByTestId("crop-confirm")).toBeInTheDocument()
		expect(screen.getByTestId("crop-cancel")).toBeInTheDocument()
	})

	test("confirm crops (via the shared cropper) and submits the cover, then closes", async () => {
		const submitCover = vi.fn(async (_dataUrl: string) => ({ ok: true }))
		const onOpenChange = vi.fn()
		render(
			<CoverCropDialog
				open
				onOpenChange={onOpenChange}
				dataUrl="data:image/png;base64,mem"
				submitCover={submitCover}
			/>,
		)

		fireEvent.click(screen.getByTestId("crop-confirm"))

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
		// The blob became a data URL before being handed to the reserved boundary.
		const dataUrl = submitCover.mock.calls[0]?.[0] as string
		expect(dataUrl).toMatch(/^data:/)
	})

	test("shows the unavailable message when the reserved API declines", async () => {
		const submitCover = vi.fn(async () => ({
			ok: false,
			reason: "api-unavailable",
		}))
		const onOpenChange = vi.fn()
		render(
			<CoverCropDialog
				open
				onOpenChange={onOpenChange}
				dataUrl="data:image/png;base64,mem"
				submitCover={submitCover}
			/>,
		)

		fireEvent.click(screen.getByTestId("crop-confirm"))

		await waitFor(() =>
			expect(screen.getByTestId("crop-error")).toBeInTheDocument(),
		)
		expect(onOpenChange).not.toHaveBeenCalled()
	})
})
