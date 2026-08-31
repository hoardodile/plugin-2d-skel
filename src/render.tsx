import "./index.css"

import { createPluginRoot } from "@hoardodile/sdk-react"
import { EngineViewer } from "./render/EngineViewer"
import { PluginAPIProvider } from "./render/hooks"

function Preview() {
	return <EngineViewer />
}

createPluginRoot({ provider: PluginAPIProvider, render: Preview })
