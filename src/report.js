import { MISSING_TRANSLATION_VALUE } from './utils.js'

export function extractI18NReport (parsedVueFiles, parsedLanguageFiles) {
  const missingKeys = []
  const unusedKeys = []

  Object.entries(parsedLanguageFiles).forEach(([language, languageItems]) => {
    // Find Missing keys
    parsedVueFiles.forEach(vueItem => {
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
      .filter(langItem => parsedVueFiles.every(vueItem => vueItem.path !== langItem.path))
      .forEach(langItem => {
        unusedKeys.push({ ...langItem, language })
      })
  })

  return {
    missingKeys,
    unusedKeys
  }
}
