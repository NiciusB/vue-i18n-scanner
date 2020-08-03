// Modified from https://github.com/vonvonme/l10n-tools/blob/release/po.js
/* eslint-disable no-prototype-builtins */

import fs from 'fs'
import * as gettextParser from 'gettext-parser'
import { sortSet } from './utils'

export class PoEntryBuilder {
  constructor (msgctxt, msgid, { allowSpaceInId = false } = {}) {
    this.msgctxt = msgctxt || null
    if (!allowSpaceInId) {
      msgid = msgid.trim()
    }
    this.msgid = msgid
    this.plural = null
    this.references = new Set()
    this.comments = new Set()
    this.flags = new Set()
  }

  static fromPoEntry (poEntry) {
    const builder = new PoEntryBuilder(poEntry.msgctxt, poEntry.msgid)
    builder.plural = poEntry.msgid_plural || null
    if (poEntry.comments) {
      if (poEntry.comments.reference) {
        for (const reference of poEntry.comments.reference.split(/\r?\n|\r/)) {
          builder.references.add(reference)
        }
      }
      if (poEntry.comments.extracted) {
        for (const comment of poEntry.comments.extracted.split(/\r?\n|\r/)) {
          builder.comments.add(comment)
        }
      }
      if (poEntry.comments.flag) {
        for (const flag of poEntry.comments.flag.split(/\r?\n|\r/)) {
          builder.flags.add(flag)
        }
      }
    }
    return builder
  }

  setPlural (plural) {
    if (this.plural && this.plural !== plural) {
      throw new Error(`overwriting plural from ${this.plural} to ${plural}`)
    }
    this.plural = plural
    return this
  }

  addReference (filename, line = null) {
    if (line == null) {
      this.references.add(filename)
    } else {
      this.references.add(filename + ':' + line)
    }
    return this
  }

  addComment (comment) {
    this.comments.add(comment)
    return this
  }

  addFlag (flag) {
    this.flags.add(flag)
    return this
  }

  toPoEntry () {
    const poEntry = {}

    if (this.msgctxt) {
      poEntry.msgctxt = this.msgctxt
    }

    poEntry.msgid = this.msgid

    if (this.plural) {
      poEntry.msgid_plural = this.plural
      poEntry.msgstr = ['', '']
    } else {
      poEntry.msgstr = ['']
    }

    poEntry.comments = {}

    if (this.references.size > 0) {
      poEntry.comments.reference = sortSet(this.references).join('\n')
    }

    if (this.flags.size > 0) {
      poEntry.comments.flag = sortSet(this.flags).join('\n')
    }

    if (this.comments.size > 0) {
      poEntry.comments.extracted = sortSet(this.comments).join('\n')
    }

    return poEntry
  }
}

export function setPoEntryFlag (poEntry, flag) {
  if (!poEntry.hasOwnProperty('comments')) {
    poEntry.comments = {}
  }
  poEntry.comments.flag = flag
}

export function removePoEntryFlag (poEntry) {
  if (!poEntry.hasOwnProperty('comments')) {
    return
  }
  delete poEntry.comments.flag
}

export function getPoEntryFlag (poEntry) {
  if (!poEntry.hasOwnProperty('comments')) {
    return null
  }
  return poEntry.comments.flag || null
}

export function findPoEntry (po, msgctxt, msgid) {
  if (msgctxt == null) {
    msgctxt = ''
  }
  if (!po.translations.hasOwnProperty(msgctxt)) {
    return null
  }
  if (!msgctxt) {
    return po.translations[msgctxt][msgid] || null
  }
  if (po.translations[msgctxt].hasOwnProperty(msgid)) {
    return po.translations[msgctxt][msgid]
  }
  const contextMsgIds = Object.keys(po.translations[msgctxt])
  if (contextMsgIds.length > 1) {
    throw new Error(`[findPoEntry] multiple msgid in msgctxt ${msgctxt}`)
  }
  if (contextMsgIds.length === 0) {
    return null
  }
  return po.translations[msgctxt][contextMsgIds[0]] || null
}

export function setPoEntry (po, poEntry) {
  const oldPoEntry = findPoEntry(po, poEntry.msgctxt, poEntry.msgid)
  const msgctxt = poEntry.msgctxt || ''
  if (oldPoEntry) {
    if (oldPoEntry.msgid !== poEntry.msgid) {
      delete po.translations[msgctxt][oldPoEntry.msgid]
    }
  }
  if (!po.translations.hasOwnProperty(msgctxt)) {
    po.translations[msgctxt] = {}
  }
  po.translations[msgctxt][poEntry.msgid] = poEntry
}

export function readPoFile (poPath) {
  const poInput = fs.readFileSync(poPath)
  return gettextParser.po.parse(poInput, 'UTF-8')
}

export function writePoFile (poPath, po) {
  const output = gettextParser.po.compile(po)
  fs.writeFileSync(poPath, output)
}

export function * getPoEntries (po) {
  for (const [msgctxt, poEntries] of Object.entries(po.translations)) {
    for (const [msgid, poEntry] of Object.entries(poEntries)) {
      if (!msgctxt && !msgid) {
        continue
      }
      yield poEntry
    }
  }
}

export function * getPoEntriesFromFile (poPath) {
  yield * getPoEntries(readPoFile(poPath))
}

export function * getPoEntriesFromString (poInput) {
  yield * getPoEntries(gettextParser.po.parse(poInput, 'UTF-8'))
}

export function checkPoEntrySpecs (poEntry, specs) {
  return specs.every(spec => {
    const positive = !spec.startsWith('!')
    if (!positive) {
      spec = spec.substr(1)
    }

    if (spec === 'total') {
      return positive
    } else if (spec === 'untranslated') {
      if (!poEntry.msgstr[0]) {
        return positive
      } else {
        return !positive
      }
    } else if (spec === 'translated') {
      if (poEntry.msgstr[0]) {
        return positive
      } else {
        return !positive
      }
    } else {
      if (spec === getPoEntryFlag(poEntry)) {
        return positive
      } else {
        return !positive
      }
    }
  })
}

export function exportPoToJson (poPath, { keySeparator = '.' } = {}) {
  const json = {}
  const po = readPoFile(poPath)
  for (const poEntry of getPoEntries(po)) {
    if (poEntry.msgctxt) {
      throw new Error('[exportPoToJson] po entry with msgctxt not supported yet')
    }

    if (poEntry.msgid && poEntry.msgstr[0]) {
      const keys = keySeparator ? poEntry.msgid.split(keySeparator) : [poEntry.msgid]
      const lastKey = keys.pop()

      let obj = json
      for (const key of keys) {
        if (!obj.hasOwnProperty(key)) {
          obj[key] = {}
        }
        obj = obj[key]
      }
      obj[lastKey] = poEntry.msgstr[0]
    }
  }
  return json
}
