/* eslint-env jest */
import path from 'path'
import { readVueFiles, extractI18nItemsFromVueFiles } from '../src/vue-files'

describe('readVueFiles', () => {
  test('reads a file', () => {
    const vueFilePath = path.join(__dirname, 'files', 'simple.js')
    const codeItems = readVueFiles(vueFilePath)

    expect(codeItems).toHaveLength(1)
    expect(codeItems[0]).toEqual({
      fileName: '/test/files/simple.js',
      path: vueFilePath,
      content: 'console.log(1337)' + '\n'
    })
  })
})

describe('extractI18nItemsFromVueFiles', () => {
  test('parses simple vue file', () => {
    const filesList = [{
      fileName: 'test.vue',
      path: 'test.vue',
      content: `<template>
         <div>
           {{ $t('test.simple') }}
         </div>
       </template>`
    }]

    const codeItems = extractI18nItemsFromVueFiles(filesList)

    expect(codeItems).toHaveLength(1)
    expect(codeItems[0]).toEqual({ file: 'test.vue', line: 3, path: 'test.simple' })
  })

  test('parses simple JS file', () => {
    const filesList = [{
      fileName: 'test.js',
      path: 'test.js',
      content: 'console.log(this.$t(\'test.simple\'))'
    }]
    const codeItems = extractI18nItemsFromVueFiles(filesList)

    expect(codeItems).toHaveLength(1)
    expect(codeItems[0]).toEqual({ file: 'test.js', line: 1, path: 'test.simple' })
  })

  test('parses translations inside an object', () => {
    const filesList = [{
      fileName: 'test.vue',
      path: 'test.vue',
      content: `<template>
      <div :style="{ color: $t('test.color') }">
        Hello
      </div>
    </template>`
    }]

    const codeItems = extractI18nItemsFromVueFiles(filesList)

    expect(codeItems).toHaveLength(1)
    expect(codeItems[0]).toEqual({ file: 'test.vue', line: 2, path: 'test.color' })
  })

  test('parses translations inside a directive, like v-for or v-tooltip', () => {
    const filesList = [{
      fileName: 'test.vue',
      path: 'test.vue',
      content: `<template>
      <div>
        <button
          v-for="(value, key) in {
            'key1': $t('for')
          }"
          v-tooltip="{
            content: $t('tooltip')
          }"
          v-somethingelse="red"
          :key="key"
        >
        {{ key }}: {{ name }}
        </button>
      </div>
    </template>`
    }]

    const codeItems = extractI18nItemsFromVueFiles(filesList)

    expect(codeItems).toHaveLength(2)
    expect(codeItems[0]).toEqual({ file: 'test.vue', line: 4, path: 'for' })
    expect(codeItems[1]).toEqual({ file: 'test.vue', line: 6, path: 'tooltip' })
  })
})
