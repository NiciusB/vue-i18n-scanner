import path from 'path'
import fs from 'fs'
import log from 'npmlog'
import yaml from 'js-yaml'
import chalk from 'chalk'

export function parseLanguageFiles (parsedLanguageFiles) {
  const accumulator = {}

  parsedLanguageFiles.forEach((file) => {
    const i18nInFile = Object.keys(file.content).map((key, index) => {
      return {
        line: index,
        path: key,
        value: file.content[key],
        file: file.fileName
      }
    })

    accumulator[file.language] = i18nInFile
  })

  return accumulator
}

export function readLangFiles (languageFolder, languageList, languageFormat) {
  if (!fs.existsSync(languageFolder)) {
    throw new Error(`languageFolder isn't a valid folder (${chalk.yellow(languageFolder)})`)
  }

  const parsedLanguageFiles = languageList.map(language => {
    const langFilePath = path.join(languageFolder, `${language}.${languageFormat}`)
    let content

    if (fs.existsSync(langFilePath)) {
      try {
        switch (languageFormat) {
          case 'yaml':
          case 'yml': {
            const str = fs.readFileSync(langFilePath, 'utf8')
            content = yaml.safeLoad(str)
            break
          }
          case 'js': {
            const file = require(langFilePath)
            content = file ? file.default : undefined
            break
          }
          case 'json': {
            const str = fs.readFileSync(langFilePath, 'utf8')
            content = JSON.parse(str)
            break
          }
        }
      } catch (err) {
        throw new Error(`Language file ${chalk.yellow(langFilePath)} is corrupted: ${err.message}`)
      }
    } else {
      log.warn('readLangFiles', `Creating language file for ${language}`)
    }
    if (!content) content = {}

    const fileName = langFilePath.replace(process.cwd(), '')

    return {
      language,
      fileName,
      path: langFilePath,
      content
    }
  })

  return parsedLanguageFiles
}
