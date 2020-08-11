import path from 'path'
import fs from 'fs'
import yaml from 'js-yaml'
import { MISSING_TRANSLATION_VALUE } from './utils'

export function writeMissingToLanguage (parsedLanguageFiles, languageFolder, languageFormat, languageList, missingKeysToAdd, sort) {
  languageList.forEach((language, index) => {
    const langFilePath = path.join(languageFolder, `${language}.${languageFormat}`)
    const languageFile = parsedLanguageFiles[index]

    missingKeysToAdd.forEach(item => {
      if (item.language === language) {
        languageFile.content[item.path] = MISSING_TRANSLATION_VALUE
      }
    })

    const stringifyReplace = sort ? Object.keys(languageFile.content).sort() : null
    const stringifiedContent = JSON.stringify(languageFile.content, stringifyReplace, 2)

    if (languageFormat === 'json') {
      fs.writeFileSync(langFilePath, stringifiedContent)
    } else if (languageFormat === 'js') {
      const jsFile = `export default ${stringifiedContent}; \n`
      fs.writeFileSync(langFilePath, jsFile)
    } else if (languageFormat === 'yaml' || languageFormat === 'yml') {
      const yamlFile = yaml.safeDump(languageFile.content, { sortKeys: sort })
      fs.writeFileSync(langFilePath, yamlFile)
    }
  })
}
