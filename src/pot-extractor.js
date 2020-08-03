// Modified from https://github.com/vonvonme/l10n-tools/blob/release/pot-extractor.js
/* eslint-disable no-prototype-builtins */

import cheerio from 'cheerio'
import * as babelParser from '@babel/parser'
import log from 'npmlog'
import traverse from '@babel/traverse'
import { findPoEntry, PoEntryBuilder, setPoEntry } from './po'
import * as gettextParser from 'gettext-parser'
import * as ts from 'typescript'
import Engine from 'php-parser'

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
        throw new Error('cannot extract translations from template strings (`Example`), use string literal directly')
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
              log.warn('extractJsNode', `'${src.substring(node.start, node.end)}': (${node.loc.filename}:${node.loc.start.line})`)
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
            log.warn('extractJsIdentifierNode', `'${src.substring(node.start, node.end)}': (${node.loc.filename}:${node.loc.start.line})`)
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
            log.warn('extractJsObjectNode', `'${src.substring(node.start, node.end)}': (${node.loc.filename}:${node.loc.start.line})`)
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
    } else if (marker.type === 'angular') {
      this.extractAngularExpression(filename, src, startLine)
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

  extractAngularExpression (filename, src, startLine = 1) {
    for (const filterExpr of this.filterExprs) {
      const match = filterExpr.exec(src)
      if (match == null) {
        continue
      }

      const contentExpr = match[1]
      try {
        const node = babelParser.parseExpression(contentExpr, getBabelParserOptions({
          sourceType: 'script',
          sourceFilename: filename,
          startLine: startLine
        }))
        try {
          const ids = this._evaluateJsArgumentValues(node)
          for (const id of ids) {
            this.addMessage({ filename, line: node.loc.start.line }, id)
          }
        } catch (err) {
          log.warn('extractAngularExpression', err.message)
          log.warn('extractAngularExpression', `${src}: (${node.loc.filename}:${node.loc.start.line})`)
        }
      } catch (err) {
        log.warn('extractAngularExpression', `cannot extract from '${src}' (${filename}:${startLine})`)
      }
    }
  }

  _evaluateTsArgumentValues (node) {
    if (node.kind === ts.SyntaxKind.StringLiteral) {
      return [node.text]
    } else if (node.kind === ts.SyntaxKind.Identifier) {
      throw new Error('cannot extract translations from variable, use string literal directly')
    } else if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
      throw new Error('cannot extract translations from variable, use string literal directly')
    } else if (node.kind === ts.SyntaxKind.BinaryExpression && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const values = []
      for (const leftValue of this._evaluateTsArgumentValues(node.left)) {
        for (const rightValue of this._evaluateTsArgumentValues(node.right)) {
          values.push(leftValue + rightValue)
        }
      }
      return values
    } else if (node.kind === ts.SyntaxKind.ConditionalExpression) {
      return this._evaluateTsArgumentValues(node.whenTrue)
        .concat(this._evaluateTsArgumentValues(node.whenFalse))
    } else {
      throw new Error(`cannot extract translations from '${node.kind}' node, use string literal directly`)
    }
  }

  extractTsNode (filename, src, ast, startLine = 1) {
    const visit = node => {
      if (node.kind === ts.SyntaxKind.CallExpression) {
        const pos = findNonSpace(src, node.pos)
        for (const { objectName, propName, position } of this.keywordDefs) {
          if (objectName != null) {
            if (node.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
              const callee = node.expression.expression
              if ((objectName === 'this' && callee.kind === ts.SyntaxKind.ThisKeyword) ||
                                (callee.kind === ts.SyntaxKind.Identifier && callee.text === objectName)) {
                const name = node.expression.name
                if (name.kind === ts.SyntaxKind.Identifier && name.text === propName) {
                  try {
                    const ids = this._evaluateTsArgumentValues(node.arguments[position])
                    for (const id of ids) {
                      this.addMessage({ filename, line: getLineTo(src, pos, startLine) }, id)
                    }
                  } catch (err) {
                    log.warn('extractTsNode', err.message)
                    log.warn('extractTsNode', `'${src.substring(pos, node.end)}': (${filename}:${getLineTo(src, pos, startLine)})`)
                  }
                }
              }
            }
          } else {
            if (node.expression.kind === ts.SyntaxKind.Identifier) {
              const callee = node.expression
              if (callee.text === propName) {
                try {
                  const ids = this._evaluateTsArgumentValues(node.arguments[position])
                  for (const id of ids) {
                    this.addMessage({ filename, line: getLineTo(src, pos, startLine) }, id)
                  }
                } catch (err) {
                  log.warn('extractTsNode', err.message)
                  log.warn('extractTsNode', `'${src.substring(pos, node.end)}': (${filename}:${getLineTo(src, pos, startLine)})`)
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }

  extractTsModule (filename, src, startLine = 1) {
    try {
      const ast = ts.createSourceFile(filename, src, ts.ScriptTarget.Latest, true)
      this.extractTsNode(filename, src, ast, startLine)
    } catch (err) {
      log.warn('extractJsModule', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
    }
  }

  extractCocosAsset (filename, src) {
    const objs = JSON.parse(src)
    for (const obj of objs) {
      if (!obj.hasOwnProperty('__type__')) {
        return
      }

      const type = obj.__type__
      if (this.options.cocosKeywords.hasOwnProperty(type)) {
        const name = this.options.cocosKeywords[type]
        const id = obj[name]
        if (id) {
          const path = getCocosNodePath(objs, obj)
          this.addMessage({ filename, line: path }, id)
        }
      }
    }
  }

  _evaluatePhpArgumentValues (node) {
    if (node.kind === 'string') {
      return [node.value]
    } else if (node.kind === 'encapsed') {
      throw new Error('cannot extract translations from interpolated string, use sprintf for formatting')
    } else if (node.kind === 'variable') {
      throw new Error('cannot extract translations from variable, use string literal directly')
    } else if (node.kind === 'propertylookup') {
      throw new Error('cannot extract translations from variable, use string literal directly')
    } else if (node.kind === 'bin' && node.type === '+') {
      const values = []
      for (const leftValue of this._evaluatePhpArgumentValues(node.left)) {
        for (const rightValue of this._evaluatePhpArgumentValues(node.right)) {
          values.push(leftValue + rightValue)
        }
      }
      return values
    } else if (node.kind === 'retif') {
      return this._evaluatePhpArgumentValues(node.trueExpr)
        .concat(this._evaluatePhpArgumentValues(node.falseExpr))
    } else {
      throw new Error(`cannot extract translations from '${node.kind}' node, use string literal directly`)
    }
  }

  extractPhpNode (filename, src, Node, ast, startLine = 1) {
    const visit = node => {
      if (node.kind === 'call') {
        for (const { propName, position } of this.keywordDefs) {
          if (node.what.kind === 'classreference') {
            if (node.what.name === propName) {
              const startOffset = src.substr(0, node.loc.start.offset).lastIndexOf(propName)
              try {
                const ids = this._evaluatePhpArgumentValues(node.arguments[position])
                for (const id of ids) {
                  this.addMessage({ filename, line: node.loc.start.line }, id)
                }
              } catch (err) {
                log.warn('extractPhpNode', err.message)
                log.warn('extractPhpNode', `'${src.substring(startOffset, node.loc.end.offset)}': (${filename}:${node.loc.start.line})`)
              }
            }
          }
        }
      }

      for (const key in node) {
        // noinspection JSUnfilteredForInLoop
        const value = node[key]
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child instanceof Node) {
              visit(child)
            }
          }
        } else if (value instanceof Node) {
          visit(value)
        }
      }
    }
    visit(ast)
  }

  extractPhpCode (filename, src, startLine = 1) {
    const parser = new Engine({
      parser: {
        extractDoc: true,
        locations: true,
        php7: true
      },
      ast: {
        withPositions: true
      }
    })

    try {
      const ast = parser.parseCode(src)
      const Node = require('php-parser/src/ast/node')
      this.extractPhpNode(filename, src, Node, ast, startLine)
    } catch (err) {
      log.warn('extractPhpCode', `error parsing '${src.split(/\n/g)[err.loc.line - 1].trim()}' (${filename}:${err.loc.line})`)
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

  getPo () {
    return this.po
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

function findNonSpace (src, index) {
  const match = /^(\s*)\S/.exec(src.substring(index))
  if (match) {
    return index + match[1].length
  } else {
    return index
  }
}

function getCocosNodePath (nodes, obj) {
  if (obj.hasOwnProperty('node')) {
    const node = nodes[obj.node.__id__]
    return getCocosNodePath(nodes, node)
  } else if (obj.hasOwnProperty('_parent')) {
    if (obj._parent) {
      const parent = nodes[obj._parent.__id__]
      const name = obj._name
      const path = getCocosNodePath(nodes, parent)
      if (path) {
        return path + '.' + name
      } else {
        return name
      }
    } else {
      return ''
    }
  } else {
    throw new Error(`unknown cocos object: ${JSON.stringify(obj)}`)
  }
}

export function getLineTo (src, index, startLine = 1) {
  const matches = src.substr(0, index).match(/\n/g)
  if (!matches) {
    return startLine
  }
  return startLine + matches.length
}
