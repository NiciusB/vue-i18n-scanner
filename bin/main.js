'use strict'
import program from 'commander'
import { reportCommand } from '../src/index.js'

program
  .command('report', { isDefault: true })
  .description('Create a report from a glob of your Vue.js source files and your language files.')
  .requiredOption(
    '-v, --vueFolder <vueFolder>',
    'The Vue.js file(s) you want to extract i18n strings from. It must be a relative path to a folder'
  )
  .requiredOption(
    '-l, --languageFolder <languageFolder>',
    'The language file(s) you want to compare your Vue.js file(s) to. It must be a relative path to a folder'
  )
  .requiredOption(
    '-f, --languageFormat <languageFormat>',
    'The format for the language file(s) you want to compare your Vue.js file(s) to. It can be a path to a folder or to a file. It accepts js, json and yaml'
  )
  .requiredOption(
    '-L, --languageList <languageList>',
    'The list of languages you support, separated by comma. (ex. en,es,fr)'
  )
  .option(
    '-a, --shouldAddMissingKeys <shouldAddMissingKeys>',
    'Automatically add missing keys to language files', true
  )
  .option(
    '-s, --sort <sort>',
    'Sort language files alphabetically', true
  )
  .action(reportCommand)

program.parseAsync(process.argv)
