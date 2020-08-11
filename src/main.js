import path from 'path'
import chalk from 'chalk'

import { parseVueFiles } from './vue-files'
import { parseLanguageFiles, readLangFiles } from './language-files-read'
import { writeMissingToLanguage } from './language-files-write'
import { extractI18NReport } from './report'

export async function reportCommand ({ vueFolder, languageFolder, languageFormat, languageList, shouldAddMissingKeys = true, sort = true }) {
  languageFolder = path.resolve(process.cwd(), languageFolder)
  const vueFilesPath = `${path.resolve(process.cwd(), vueFolder)}/**/*.?(js|vue)`
  languageList = languageList.split(',').map(elm => elm.trim()).filter(Boolean)

  const codeItems = parseVueFiles(vueFilesPath)

  const parsedLanguageFiles = readLangFiles(languageFolder, languageList, languageFormat)
  const parsedLanguages = parseLanguageFiles(parsedLanguageFiles)

  const report = extractI18NReport(codeItems, parsedLanguages)

  if (report.missingKeys.length) {
    console.log(chalk.magenta('Missing keys:'))
    console.table(report.missingKeys)
  } else {
    console.log(chalk.green('No missing keys!'))
  }

  if (report.unusedKeys.length) {
    console.log(chalk.magenta('Unused keys:'))
    console.table(report.unusedKeys)
  } else {
    console.log(chalk.green('No unused keys!'))
  }

  const missingKeysToAdd = shouldAddMissingKeys ? report.missingKeys.filter(key => key.isNew) : []
  if (sort || missingKeysToAdd.length > 0) {
    writeMissingToLanguage(parsedLanguageFiles, languageFolder, languageFormat, languageList, missingKeysToAdd, sort)
    if (missingKeysToAdd.length > 0) console.log(chalk.magenta(`${missingKeysToAdd.length} missing keys have been added to your languages files`))
  }
}
