<h1 align="center">vue-i18n-scanner</h1>
                                                                                       
---

`vue-i18n-scanner` is built to work with your Vue.js projects using [vue-i18n](https://kazupon.github.io/vue-i18n/). When run `vue-18n-scanner` analyses your Vue.js source code for any `vue-i18n` key usages (ex. $t(''), $tc(''), ...) as well as your language files (ex. de_DE.js, en_EN.json, ...), in order to:

- Report keys that are missing in the language files.
- Report unused keys in the language files.
- Add missing keys to language files

## Example
`vue-i18n-scanner -v '**/*.?(js|vue)' -l 'locales/*.json'`

## License

[MIT](http://opensource.org/licenses/MIT)
