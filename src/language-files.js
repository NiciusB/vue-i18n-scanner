import path from 'path'
import fs from 'fs'
import glob from 'glob'
import yaml from 'js-yaml'
import isValidGlob from 'is-valid-glob'
import chalk from 'chalk'
import { MISSING_TRANSLATION_VALUE } from './utils.js'

function readLangFiles (src) {
  if (!isValidGlob(src)) {
    throw new Error(`languageFiles isn't a valid glob pattern (${chalk.yellow(src)})`)
  }

  const targetFiles = glob.sync(src)

  if (targetFiles.length === 0) {
    throw new Error(`languageFiles glob (${chalk.yellow(src)}) has no files`)
  }

  return targetFiles.map(filePath => {
    const langPath = path.resolve(process.cwd(), filePath)
    const langFileStr = fs.readFileSync(langPath, 'utf8')

    const extension = langPath.substring(langPath.lastIndexOf('.')).toLowerCase()
    const isYaml = extension === '.yaml' || extension === '.yml'

    try {
      var content = isYaml ? yaml.safeLoad(langFileStr) : JSON.parse(langFileStr)
    } catch (err) {
      throw new Error(`Language file ${chalk.yellow(filePath)} is corrupted: ${err.message}`)
    }

    const fileName = filePath.replace(process.cwd(), '')

    return { fileName, path: filePath, content }
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

export function writeMissingToLanguage (resolvedLanguageFiles, missingKeys) {
  const languageFiles = readLangFiles(resolvedLanguageFiles)
  languageFiles.forEach(languageFile => {
    missingKeys.forEach(item => {
      if ((item.language && languageFile.fileName.includes(item.language)) || !item.language) {
        languageFile.content[item.path] = MISSING_TRANSLATION_VALUE
      }
    })

    const fileExtension = languageFile.fileName.substring(languageFile.fileName.lastIndexOf('.') + 1)
    const filePath = path.resolve(process.cwd() + languageFile.fileName)
    const stringifiedContent = JSON.stringify(languageFile.content, null, 2)

    if (fileExtension === 'json') {
      fs.writeFileSync(filePath, stringifiedContent)
    } else if (fileExtension === 'js') {
      const jsFile = `export default ${stringifiedContent}; \n`
      fs.writeFileSync(filePath, jsFile)
    } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
      const yamlFile = yaml.safeDump(languageFile.content)
      fs.writeFileSync(filePath, yamlFile)
    }
  })
}

export function parseLanguageFiles (languageFilesPath) {
  const filesList = readLangFiles(languageFilesPath)
  return extractI18nItemsFromLanguageFiles(filesList)
}
