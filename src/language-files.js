import path from 'path'
import fs from 'fs'
import log from 'npmlog'
import yaml from 'js-yaml'
import chalk from 'chalk'
import { MISSING_TRANSLATION_VALUE } from './utils.js'

export function writeMissingToLanguage (languageFolder, languageFormat, languageList, newMissingKeys, sort) {
  const parsedLanguageFiles = readLangFiles(languageFolder, languageList, languageFormat)

  languageList.forEach((language, index) => {
    const langFilePath = path.join(languageFolder, `${language}.${languageFormat}`)
    const languageFile = parsedLanguageFiles[index]

    newMissingKeys.forEach(item => {
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

export function parseLanguageFiles (languageFolder, languageList, languageFormat) {
  const parsedLanguageFiles = readLangFiles(languageFolder, languageList, languageFormat)
  return extractI18nItemsFromLanguageFiles(parsedLanguageFiles)
}

function readLangFiles (languageFolder, languageList, languageFormat) {
  if (!fs.existsSync(languageFolder)) {
    throw new Error(`languageFolder isn't a valid folder (${chalk.yellow(languageFolder)})`)
  }

  return languageList.map(language => {
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

    return { fileName, path: langFilePath, content }
  })
}

function extractI18nItemsFromLanguageFiles (languageFiles) {
  const accumulator = {}

  languageFiles.forEach((file) => {
    const language = file.fileName.substring(file.fileName.lastIndexOf('/') + 1, file.fileName.lastIndexOf('.'))

    const i18nInFile = Object.keys(file.content).map((key, index) => {
      return {
        line: index,
        path: key,
        value: file.content[key],
        file: file.fileName
      }
    })

    accumulator[language] = i18nInFile
  })

  return accumulator
}
