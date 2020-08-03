import path from 'path'
import chalk from 'chalk'

import { parseVueFiles } from './vue-files.js'
import { parseLanguageFiles, writeMissingToLanguage } from './language-files.js'
import { extractI18NReport } from './report.js'

export function createI18NReport (vueFiles, languageFiles) {
  const resolvedVueFiles = path.resolve(process.cwd(), vueFiles)
  const resolvedLanguageFiles = path.resolve(process.cwd(), languageFiles)

  const parsedVueFiles = parseVueFiles(resolvedVueFiles)
  const parsedLanguageFiles = parseLanguageFiles(resolvedLanguageFiles)

  return extractI18NReport(parsedVueFiles, parsedLanguageFiles)
}

export async function reportCommand ({ vueFiles, languageFiles, shouldAdd = true }) {
  const report = createI18NReport(vueFiles, languageFiles)

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

  const newMissingKeys = report.missingKeys.filter(key => key.isNew)
  if (shouldAdd && newMissingKeys.length > 0) {
    const resolvedLanguageFiles = path.resolve(process.cwd(), languageFiles)
    writeMissingToLanguage(resolvedLanguageFiles, newMissingKeys)
    console.log(chalk.magenta(`${newMissingKeys.length} missing keys have been added to your languages files`))
  }
}

export * from './vue-files.js'
export * from './language-files.js'
export * from './report.js'
