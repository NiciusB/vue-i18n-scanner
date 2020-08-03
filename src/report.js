import fs from 'fs'

export const VueI18NExtractReportTypes = {
  None: 0,
  Missing: 1 << 0,
  Unused: 1 << 1,
  All: ~(~0 << 2)
}

export function extractI18NReport (parsedVueFiles, parsedLanguageFiles, reportType = VueI18NExtractReportTypes.All) {
  const missingKeys = []
  const unusedKeys = []

  Object.keys(parsedLanguageFiles).forEach(language => {
    let languageItems = parsedLanguageFiles[language]

    parsedVueFiles.forEach(vueItem => {
      const usedByVueItem = function (languageItem) {
        return languageItem.path === vueItem.path || languageItem.path.startsWith(vueItem.path + '.')
      }

      if (!parsedLanguageFiles[language].some(usedByVueItem)) {
        missingKeys.push(({ ...vueItem, language }))
      }

      languageItems = languageItems.filter(languageItem => !usedByVueItem(languageItem))
    })

    unusedKeys.push(...languageItems.map((item) => ({ ...item, language })))
  })

  let extracts = {}
  if (reportType & VueI18NExtractReportTypes.Missing) {
    extracts = Object.assign(extracts, { missingKeys })
  }
  if (reportType & VueI18NExtractReportTypes.Unused) {
    extracts = Object.assign(extracts, { unusedKeys })
  }

  return extracts
}

export async function writeReportToFile (report, writePath) {
  const reportString = JSON.stringify(report)
  return new Promise((resolve, reject) => {
    fs.writeFile(
      writePath,
      reportString,
      (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      }
    )
  })
}
