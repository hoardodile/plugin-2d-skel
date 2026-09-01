import { createPluginTranslation } from "@hoardodile/sdk-react"
import de from "./locales/de"
import en from "./locales/en"
import es from "./locales/es"
import ja from "./locales/ja"
import zh from "./locales/zh"

const { useTranslation } = createPluginTranslation({ en, zh, ja, de, es })

export { useTranslation }
