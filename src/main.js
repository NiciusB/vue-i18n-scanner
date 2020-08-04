import path from 'path'
import chalk from 'chalk'

import { parseVueFiles } from './vue-files.js'
import { parseLanguageFiles, writeMissingToLanguage } from './language-files.js'
import { extractI18NReport } from './report.js'

export async function reportCommand ({ vueFolder, languageFolder, languageFormat, languageList, shouldAddMissingKeys = true, sort = true }) {
  languageFolder = path.resolve(process.cwd(), languageFolder)
  const vueFilesPath = `${path.resolve(process.cwd(), vueFolder)}/**/*.?(js|vue)`
  languageList = languageList.split(',').map(elm => elm.trim()).filter(Boolean)

  const codeItems = parseVueFiles(vueFilesPath)
  const parsedLanguages = parseLanguageFiles(languageFolder, languageList, languageFormat)

  const report = extractI18NReport(codeItems, parsedLanguages)

  if (report.missingKeys) {
    if (report.missingKeys.length) {
      console.log(chalk.magenta('Missing keys:'))
      console.table(report.missingKeys)
    } else {
      console.log(chalk.green('No missing keys!'))
    }
  }
  if (report.unusedKeys) {
    if (report.unusedKeys.length) {
      console.log(chalk.magenta('Unused keys:'))
      console.table(report.unusedKeys)
    } else {
      console.log(chalk.green('No unused keys!'))
    }
  }

  const newMissingKeys = shouldAddMissingKeys ? report.missingKeys.filter(key => key.isNew) : []
  if (sort || newMissingKeys.length > 0) {
    writeMissingToLanguage(languageFolder, languageFormat, languageList, newMissingKeys, sort)
    if (newMissingKeys.length > 0)console.log(chalk.magenta(`${newMissingKeys.length} missing keys have been added to your languages files`))
  }
}
