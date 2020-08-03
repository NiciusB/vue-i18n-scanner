<template>
  <div>
        {{ $t(aVariableShouldNotWork) }}
        {{ $t(`literal with variable should not work: ${someVariable}`) }}
  </div>
</template>
