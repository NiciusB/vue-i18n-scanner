'use strict'
import program from 'commander'
import { reportCommand } from '../src/index.js'

program
  .command('report', { isDefault: true })
  .description('Create a report from a glob of your Vue.js source files and your language files.')
  .requiredOption(
    '-v, --vueFiles <vueFiles>',
    'The Vue.js file(s) you want to extract i18n strings from. It can be a path to a folder or to a file. It accepts glob patterns. (ex. *, ?, (pattern|pattern|pattern)'
  )
  .requiredOption(
    '-l, --languageFiles <languageFiles>',
    'The language file(s) you want to compare your Vue.js file(s) to. It can be a path to a folder or to a file. It accepts glob patterns (ex. *, ?, (pattern|pattern|pattern) '
  )
  .action(reportCommand)

program.parseAsync(process.argv)
