import isValidGlob from 'is-valid-glob'
import glob from 'glob'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import { PotExtractor } from './pot-extractor'
import { getPoEntriesFromString } from './po'

export function parseVueFiles (vueFilesPath) {
  const filesList = readVueFiles(vueFilesPath)
  return extractI18nItemsFromVueFiles(filesList)
}

export function readVueFiles (src) {
  if (!isValidGlob(src)) {
    throw new Error(`vueFiles isn't a valid glob pattern (${chalk.yellow(src)})`)
  }

  const targetFiles = glob.sync(src, {
    ignore: ['**/node_modules/**/*.*'],
    nodir: true
  })

  if (targetFiles.length === 0) {
    throw new Error(`vueFiles glob (${chalk.yellow(src)}) has no files`)
  }

  return targetFiles.map((filePath) => {
    const fileName = filePath.replace(process.cwd(), '')
    const content = fs.readFileSync(filePath, 'UTF-8')
    return { fileName, path: filePath, content }
  })
}

export function extractI18nItemsFromVueFiles (sourceFiles) {
  const keywords = new Set()
  keywords.add('$t')
  keywords.add('vm.$t')
  keywords.add('this.$t')
  keywords.add('app.i18n.t')
  keywords.add('$tc')
  keywords.add('vm.$tc')
  keywords.add('this.$tc')
  keywords.add('app.i18n.tc')

  const extractor = PotExtractor.create('domainName', {
    tagNames: ['i18n'],
    objectAttrs: { 'v-t': ['', 'path'] },
    exprAttrs: [/^:/, /^v-/],
    markers: [{ start: '{{', end: '}}' }],
    keywords: keywords
  })

  for (const file of sourceFiles) {
    const ext = path.extname(file.path)
    if (ext === '.vue') {
      extractor.extractVue(file.path, file.content)
    } else if (ext === '.js') {
      extractor.extractJsModule(file.path, file.content)
    } else {
      console.warn(`skipping '${file.path}': unknown extension`)
    }
  }

  const entries = [...getPoEntriesFromString(extractor.toString())].map(entry => {
    const path = entry.msgid
    const reference = entry.comments.reference.split('\n')[0]

    const lastDoubleDotIndex = reference.lastIndexOf(':')
    if (lastDoubleDotIndex === -1) throw new Error(`Invalid PO entry ${reference}`)

    const file = reference.slice(0, lastDoubleDotIndex)
    const line = parseInt(reference.slice(lastDoubleDotIndex + 1))
    return { path, line, file }
  })

  return entries
}
