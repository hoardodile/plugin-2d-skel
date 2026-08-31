import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import {
	ImageCropper,
	type CroppedImage,
} from "@hoardodile/ui/components/image-cropper"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "../i18n"
import type { CoverResult } from "./cover"

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(new Error("blob-read-failed"))
		reader.readAsDataURL(blob)
	})
}

/**
 * Quick screenshot-crop dialog. Captures the current model frame as a PNG
 * data URL, lets the user drag a crop box (via the shared
 * {@link ImageCropper}), then hands the cropped PNG data URL to the reserved
 * {@link setResourceCover} boundary via `submitCover`.
 */
export function CoverCropDialog(props: {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly dataUrl: string
	readonly submitCover: (dataUrl: string) => Promise<CoverResult>
}) {
	const { open, onOpenChange, dataUrl, submitCover } = props
	const { t } = useTranslation()
	const renderRef = useRef<() => Promise<CroppedImage>>(() => Promise.reject(new Error("no-crop")))
	const [status, setStatus] = useState<"idle" | "saving" | "error">("idle")

	const onCropReady = useCallback((render: () => Promise<CroppedImage>) => {
		renderRef.current = render
	}, [])

	async function confirm() {
		setStatus("saving")
		try {
			const cropped = await renderRef.current()
			const dataUrl2 = await blobToDataUrl(cropped.blob)
			const result = await submitCover(dataUrl2)
			if (result.ok) onOpenChange(false)
			else setStatus("error")
		} catch {
			setStatus("error")
		}
	}

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("cropCover")}
			description={t("cropHint")}
			size="lg"
			contentMotion="minimal"
			contentTestId="cover-crop-dialog"
			footer={
				<div className="flex w-full items-center justify-between gap-3">
					{status === "error" ? (
						<span className="text-xs text-destructive" data-testid="crop-error">
							{t("coverUnavailable")}
						</span>
					) : null}
					<div className="ml-auto flex items-center gap-2">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => onOpenChange(false)}
							disabled={status === "saving"}
							data-testid="crop-cancel"
						>
							{t("cancel")}
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={() => void confirm()}
							disabled={status === "saving"}
							data-testid="crop-confirm"
						>
							{t("setCover")}
						</Button>
					</div>
				</div>
			}
		>
			<ImageCropper
				src={dataUrl}
				onCropReady={onCropReady}
				displayMaxWidth="100%"
				displayMaxHeight="62vh"
			/>
		</AppDialog>
	)
}
