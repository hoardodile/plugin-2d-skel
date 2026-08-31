import type { Live2dSettings } from "./prefs"

/** Scale a motion entry's own volume by the viewer volume/mute prefs. */
export function scaledSoundVolume(
	entryVolume: number,
	settings: Pick<Live2dSettings, "volume" | "muted">,
): number {
	return settings.muted
		? 0
		: Math.max(0, Math.min(1, entryVolume * settings.volume))
}
