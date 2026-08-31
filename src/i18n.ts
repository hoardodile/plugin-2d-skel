import { createPluginTranslation } from "@hoardodile/sdk-react"
import en from "./locales/en"
import zh from "./locales/zh"
import ja from "./locales/ja"
import de from "./locales/de"
import es from "./locales/es"

const { useTranslation } = createPluginTranslation({ en, zh, ja, de, es })

export { useTranslation }
