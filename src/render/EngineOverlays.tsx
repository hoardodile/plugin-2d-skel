import { Button } from "@hoardodile/ui/components/button"
import { Empty, EmptyDescription, EmptyTitle } from "@hoardodile/ui/components/empty"
import { useTranslation } from "../i18n"

export function EngineEmptyState() {
	const { t } = useTranslation()
	return (
		<Empty className="h-full w-full" data-testid="engine-empty">
			<EmptyTitle>{t("emptyTitle")}</EmptyTitle>
			<EmptyDescription>{t("emptyBody")}</EmptyDescription>
		</Empty>
	)
}

export function EngineStatusOverlay(props: {
	readonly label: string
	readonly actionLabel?: string
	readonly onAction?: () => void
	readonly detail?: string
	readonly testId?: string
}) {
	const { label, actionLabel, onAction, detail, testId = "engine-status" } = props
	return (
		<div
			className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60"
			role="status"
			data-testid={testId}
		>
			<span className="text-sm text-white/80">{label}</span>
			{detail !== undefined && detail.length > 0 ? (
				<span className="max-w-[80%] break-words text-center text-tiny leading-snug text-white/60">
					{detail}
				</span>
			) : null}
			{actionLabel !== undefined && onAction !== undefined ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onAction}
					className="text-xs text-white hover:bg-white/10"
				>
					{actionLabel}
				</Button>
			) : null}
		</div>
	)
}
