import { MISSING_TRANSLATION_VALUE } from './utils.js'

export function extractI18NReport (codeItems, parsedLanguages) {
  const missingKeys = []
  const unusedKeys = []

  Object.entries(parsedLanguages).forEach(([language, languageItems]) => {
    // Find Missing keys
    codeItems.forEach(vueItem => {
      const langItem = languageItems.find(langItem => langItem.path === vueItem.path)
      const langValue = langItem ? langItem.value : undefined

      if (langValue === undefined || langValue === MISSING_TRANSLATION_VALUE) {
        missingKeys.push({
          ...vueItem,
          language,
          isNew: langValue !== MISSING_TRANSLATION_VALUE
        })
      }
    })

    // Find Unused keys
    languageItems
      .filter(langItem => codeItems.every(vueItem => vueItem.path !== langItem.path))
      .forEach(langItem => {
        unusedKeys.push({ ...langItem, language })
      })
  })

  return {
    missingKeys,
    unusedKeys
  }
}
