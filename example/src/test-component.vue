<template>
  <div>
    <!-- These work -->
    {{ $t('Hello world!') }}
    
    {{ $t(1 ? 'ternaries work' : 'yay') }}
    
    {{ $t('this' + 'also' + 'works') }}

    {{ $t("interpolation {num} ftw", { num: 10 }) }}

    <button
      v-for="(value, key) in {
        'key1': $t('test.insideDirective')
      }"
      :key="key"
    >
    {{ key }}: {{ name }}
    </button>


    <!-- These don't -->
    {{ $t(aVariableDoesNotWork) }}

    {{ $t(`literal with variable does not work: ${someVariable}`) }}
  </div>
</template>
