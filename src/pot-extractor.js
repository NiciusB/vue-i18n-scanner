// Modified from https://github.com/vonvonme/l10n-tools/blob/release/pot-extractor.js
/* eslint-disable no-prototype-builtins */

import cheerio from 'cheerio'
import * as babelParser from '@babel/parser'
import log from 'npmlog'
import traverse from '@babel/traverse'
import { findPoEntry, PoEntryBuilder, setPoEntry } from './po'
import * as gettextParser from 'gettext-parser'
import chalk from 'chalk'

function getBabelParserOptions (options) {
  options.plugins = [
    'doExpressions',
    'functionBind',
    'exportExtensions',
    'exportDefaultFrom',
    'exportNamespaceFrom',
    'optionalChaining',
    'nullishCoalescingOperator',
    'decorators2',
    'functionSent',
    'throwExpressions',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'dynamicImport',
    'importMeta',
    'numericSeparator',
    'bigInt',
    'optionalCatchBinding',
    'objectRestSpread',
    'asyncGenerators'
  ]
  return options
}

export class PotExtractor {
  constructor (po, options) {
    this.po = po
    this.options = Object.assign({
      keywords: [],
      tagNames: [],
      attrNames: [],
      valueAttrNames: [],
      objectAttrs: {},
      filterNames: [],
      markers: [],
      exprAttrs: [],
      cocosKeywords: {}
    }, options)

    this.filterExprs = this.options.filterNames.map(filterName => {
      return new RegExp('^(.*)\\|\\s*' + filterName)
    })

    this.keywordDefs = [...this.options.keywords].map(keyword => parseKeyword(keyword))
    this.keywordMap = buildKeywordMap(this.options.keywords)
  }

  static create (domainName, options) {
    return new PotExtractor({
      charset: 'utf-8',
      headers: {
        'project-id-version': domainName,
        'mime-version': '1.0',
        'content-type': 'text/plain; charset=utf-8',
        'content-transfer-encoding': '8bit'
      },
      translations: {}
    }, options)
  }

  _evaluateJsArgumentValues (node, path = '') {
    if (path) {
      if (node.type === 'ObjectExpression') {
        for (const prop of node.properties) {
          if (prop.key.type === 'Identifier' && prop.key.name === path) {
            return this._evaluateJsArgumentValues(prop.value)
          }
        }
        throw new Error(`no property path ${path} in object`)
      } else {
        throw new Error(`cannot extract translations with path ${path} from non-object`)
      }
    } else {
      if (node.type === 'StringLiteral') {
        return [node.value]
      } else if (node.type === 'Identifier') {
        throw new Error('cannot extract translations from variable, use string literal directly')
      } else if (node.type === 'MemberExpression') {
        throw new Error('cannot extract translations from variable, use string literal directly')
      } else if (node.type === 'TemplateLiteral') {
        throw new Error('cannot extract translations from template strings, use string literal directly')
      } else if (node.type === 'BinaryExpression' && node.operator === '+') {
        const values = []
        for (const leftValue of this._evaluateJsArgumentValues(node.left)) {
          for (const rightValue of this._evaluateJsArgumentValues(node.right)) {
            values.push(leftValue + rightValue)
          }
        }
        return values
      } else if (node.type === 'ConditionalExpression') {
        return this._evaluateJsArgumentValues(node.consequent)
          .concat(this._evaluateJsArgumentValues(node.alternate))
      } else {
        throw new Error(`cannot extract translations from '${node.type}' node, use string literal directly`)
      }
    }
  }

  _getJsCalleeName (object) {
    if (object.type === 'Identifier') {
      return object.name
    }

    if (object.type === 'ThisExpression') {
      return 'this'
    }

    if (object.type === 'MemberExpression') {
      const obj = this._getJsCalleeName(object.object)
      const prop = this._getJsCalleeName(object.property)
      if (obj == null || prop == null) {
        return null
      }
      return obj + '.' + prop
    }

    return null
  }

  extractJsNode (filename, src, ast) {
    traverse(ast, {
      enter: path => {
        const node = path.node
        if (node.type === 'CallExpression') {
          const calleeName = this._getJsCalleeName(node.callee)
          if (calleeName != null && this.keywordMap.hasOwnProperty(calleeName)) {
            try {
              const pos = this.keywordMap[calleeName]
              const ids = this._evaluateJsArgumentValues(node.arguments[pos])
              for (const id of ids) {
                this.addMessage({ filename, line: node.loc.start.line }, id)
              }
            } catch (err) {
              log.warn('extractJsNode', err.message)
              warnCodeError('extractJsNode', src, node)
              console.log('') // separate with newline
            }
          }
        }
      }
    })
  }

  extractJsIdentifierNode (filename, src, ast) {
    traverse(ast, {
      enter: path => {
        const node = path.node
        if (node.type === 'ExpressionStatement') {
          try {
            const ids = this._evaluateJsArgumentValues(node.expression)
            for (const id of ids) {
              this.addMessage({ filename, line: node.loc.start.line }, id)
            }
          } catch (err) {
            log.warn('extractJsIdentifierNode', err.message)
            warnCodeError('extractJsIdentifierNode', src, node)
            console.log('') // separate with newline
          }
        }
      }
    })
  }

  extractJsObjectNode (filename, src, ast, paths) {
    traverse(ast, {
      enter: path => {
        const node = path.node
        const errs = []
        if (node.type === 'ExpressionStatement') {
          for (const path of paths) {
            try {
              const ids = this._evaluateJsArgumentValues(node.expression, path)
              for (const id of ids) {
                this.addMessage({ filename, line: node.loc.start.line }, id)
              }
              return
            } catch (err) {
              errs.push(err)
            }
          }
          if (errs.length > 0) {
            for (const err of errs) {
              log.warn('extractJsObjectNode', err.message)
            }
            warnCodeError('extractJsObjectNode', src, node)
            console.log('') // separate with newline
          }
        }
      }
    })
  }

  extractJsModule (filename, src, startLine = 1) {
    try {
      const ast = babelParser.parse(src, getBabelParserOptions({
        sourceType: 'module',
        sourceFilename: filename,
        startLine: startLine
      }))
      this.extractJsNode(filename, src, ast)
    } catch (err) {
      log.warn('extractJsModule', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
    }
  }

  extractVue (filename, src, startLine = 1) {
    const $ = cheerio.load(src, { decodeEntities: false, withStartIndices: true })

    $.root().children().each((index, elem) => {
      if (elem.children.length === 0) {
        return
      }

      if (elem.name === 'template') {
        const content = $(elem).html()
        if (content) {
          const line = getLineTo(src, elem.children[0].startIndex, startLine)
          this.extractTemplate(filename, content, line)
        }
      } else if (elem.name === 'script') {
        const content = $(elem).html()
        if (content) {
          const type = elem.attribs.type
          if (!type || type === 'text/javascript') {
            const line = getLineTo(src, elem.children[0].startIndex, startLine)
            this.extractJsModule(filename, content, line)
          }
        }
      }
    })
  }

  extractTemplate (filename, src, startLine = 1) {
    const $ = cheerio.load(src, { decodeEntities: false, withStartIndices: true })

    $('*').each((index, elem) => {
      const node = $(elem)

      if (elem.name === 'script') {
        const content = $(elem).html()
        if (content) {
          const type = elem.attribs.type
          if (!type || type === 'text/javascript') {
            const line = getLineTo(src, elem.children[0].startIndex, startLine)
            this.extractJsModule(filename, content, line)
          } else if (type === 'text/ng-template') {
            const line = getLineTo(src, elem.children[0].startIndex, startLine)
            this.extractTemplate(filename, content, line)
          }
        }
      }

      if (this.options.tagNames.includes(elem.name)) {
        if (elem.name === 'translate') {
          const id = node.html().trim()
          if (id) {
            const line = getLineTo(src, elem.children[0].startIndex, startLine)
            const plural = elem.attribs['translate-plural'] || null
            const comment = elem.attribs['translate-comment'] || null
            const context = elem.attribs['translate-context'] || null
            this.addMessage({ filename, line }, id, { plural, comment, context })
          }
        } else if (elem.name === 'i18n') {
          if ('path' in elem.attribs) {
            const id = elem.attribs.path
            if (id) {
              const line = getLineTo(src, elem.startIndex, startLine)
              this.addMessage({ filename, line }, id)
            }
          } else if (':path' in elem.attribs) {
            const source = elem.attribs[':path']
            if (source) {
              const line = getLineTo(src, elem.startIndex, startLine)
              this.extractJsIdentifier(filename, source, line)
            }
          }
        }
      }

      if (this.options.attrNames.some(attrName => elem.attribs.hasOwnProperty(attrName))) {
        const id = node.html().trim()
        if (id) {
          const line = getLineTo(src, elem.children[0].startIndex, startLine)
          const plural = elem.attribs['translate-plural'] || null
          const comment = elem.attribs['translate-comment'] || null
          const context = elem.attribs['translate-context'] || null
          this.addMessage({ filename, line }, id, { plural, comment, context })
        }
      }

      for (const [attr, content] of Object.entries(elem.attribs)) {
        if (content) {
          if (this.options.exprAttrs.some(pattern => attr.match(pattern))) {
            let contentIndex = 0
            const attrIndex = src.substr(elem.startIndex).indexOf(attr)
            if (attrIndex >= 0) {
              contentIndex = attrIndex + attr.length
              while (/[=\s]/.test(src.substr(elem.startIndex + contentIndex)[0])) {
                contentIndex++
              }
              if (['\'', '"'].includes(src.substr(elem.startIndex + contentIndex)[0])) {
                contentIndex++
              }
            }
            const line = getLineTo(src, elem.startIndex + contentIndex, startLine)
            this.extractJsExpression(filename, content, line)
          } else if (this.options.valueAttrNames.some(pattern => attr.match(pattern))) {
            let contentIndex = 0
            const attrIndex = src.substr(elem.startIndex).indexOf(attr)
            if (attrIndex >= 0) {
              contentIndex = attrIndex + attr.length
              while (/[=\s]/.test(src.substr(elem.startIndex + contentIndex)[0])) {
                contentIndex++
              }
              if (['\'', '"'].includes(src.substr(elem.startIndex + contentIndex)[0])) {
                contentIndex++
              }
            }
            const line = getLineTo(src, elem.startIndex + contentIndex, startLine)
            this.extractJsIdentifier(filename, content, line)
          } else if (Object.keys(this.options.objectAttrs).includes(attr)) {
            let contentIndex = 0
            const attrIndex = src.substr(elem.startIndex).indexOf(attr)
            if (attrIndex >= 0) {
              contentIndex = attrIndex + attr.length
              while (/[=\s]/.test(src.substr(elem.startIndex + contentIndex)[0])) {
                contentIndex++
              }
              if (['\'', '"'].includes(src.substr(elem.startIndex + contentIndex)[0])) {
                contentIndex++
              }
            }
            const line = getLineTo(src, elem.startIndex + contentIndex, startLine)
            this.extractJsObjectPaths(filename, content, this.options.objectAttrs[attr], line)
          }
        }
      }
    })

    for (const marker of this.options.markers) {
      let srcIndex = 0
      while (true) {
        let startOffset = src.indexOf(marker.start, srcIndex)
        if (startOffset === -1) {
          break
        }

        startOffset += marker.start.length
        const endOffset = src.indexOf(marker.end, startOffset)
        if (endOffset === -1) {
          srcIndex = startOffset
          continue
        }

        const content = src.substring(startOffset, endOffset)
        const line = getLineTo(src, startOffset, startLine)
        this.extractMarkerExpression(filename, content, marker, line)

        srcIndex = endOffset + marker.end.length
      }
    }
  }

  extractMarkerExpression (filename, src, marker, startLine = 1) {
    if (!marker.type || marker.type === 'js') {
      this.extractJsExpression(filename, src, startLine)
    }
  }

  extractJsExpression (filename, src, startLine = 1) {
    try {
      const ast = babelParser.parse('(' + src + ')', getBabelParserOptions({
        sourceType: 'script',
        sourceFilename: filename,
        startLine: startLine
      }))
      this.extractJsNode(filename, src, ast)
    } catch (err) {
      log.warn('extractJsExpression', `error parsing '${src}' (${filename}:${startLine})`, err)
    }
  }

  extractJsIdentifier (filename, src, startLine = 1) {
    try {
      const ast = babelParser.parse('(' + src + ')', getBabelParserOptions({
        sourceType: 'script',
        sourceFilename: filename,
        startLine: startLine
      }))
      this.extractJsIdentifierNode(filename, src, ast)
    } catch (err) {
      log.warn('extractJsIdentifier', `error parsing '${src}' (${filename}:${startLine})`, err)
    }
  }

  extractJsObjectPaths (filename, src, paths, startLine = 1) {
    try {
      const ast = babelParser.parse('(' + src + ')', getBabelParserOptions({
        sourceType: 'script',
        sourceFilename: filename,
        startLine: startLine
      }))
      this.extractJsObjectNode(filename, src, ast, paths)
    } catch (err) {
      log.warn('extractJsObjectPaths', `error parsing '${src}' (${filename}:${startLine})`, err)
    }
  }

  addMessage ({ filename, line }, id, { plural = null, comment = null, context = null, allowSpaceInId = false } = {}) {
    const poEntry = findPoEntry(this.po, context, id)
    const builder = poEntry ? PoEntryBuilder.fromPoEntry(poEntry) : new PoEntryBuilder(context, id, { allowSpaceInId })

    builder.addReference(filename, line)
    if (plural) {
      builder.setPlural(plural)
    }
    if (comment) {
      builder.addComment(comment)
    }

    setPoEntry(this.po, builder.toPoEntry())
  }

  toString () {
    return gettextParser.po.compile(this.po, { sort: true })
  }
}

function parseKeyword (keyword) {
  const [name, _pos] = keyword.split(':')
  const position = _pos ? Number.parseInt(_pos) : 0
  const [name1, name2] = name.split('.')
  if (name2) {
    return {
      objectName: name1,
      propName: name2,
      position: position
    }
  } else {
    return {
      objectName: null,
      propName: name1,
      position: position
    }
  }
}

function buildKeywordMap (keywords) {
  const keywordMap = {}
  for (const keyword of keywords) {
    const [name, pos] = keyword.split(':')
    keywordMap[name] = pos ? Number.parseInt(pos) : 0
  }
  return keywordMap
}

export function getLineTo (src, index, startLine = 1) {
  const matches = src.substr(0, index).match(/\n/g)
  if (!matches) {
    return startLine
  }
  return startLine + matches.length
}

function warnCodeError (domain, src, node) {
  const code = src.substring(node.start, node.end)
  const path = `${node.loc.filename}:${node.loc.start.line}`
  log.warn(domain, `'${chalk.yellow(code)}': (${chalk.blue(path)})`)
}
