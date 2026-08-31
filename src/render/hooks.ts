import { definePluginAPI } from "@hoardodile/sdk-react"
import type { EngineSchema } from "../shared"

export const { PluginAPIProvider, usePluginAPI } =
	definePluginAPI<EngineSchema>()
