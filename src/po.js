// Modified from https://github.com/vonvonme/l10n-tools/blob/release/po.js
/* eslint-disable no-prototype-builtins */

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

export function * getPoEntriesFromString (poInput) {
  yield * getPoEntries(gettextParser.po.parse(poInput, 'UTF-8'))
}
