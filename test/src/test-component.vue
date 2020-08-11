<template>
  <div>
        {{ $t('test0') }}
        {{ $t( 'test1' ) }}
        {{ $t("test2") }}
        {{ $t(`test3.test`) }}
        {{ $t('test4()') }}
        {{ $t('test5""`') }}
        {{ $t(1 ? 'test6' : 'test7') }}
        {{ $t('test8.'+'1') }}
        {{ $t('test9.'+ (1 ? '1' : '2')) }}
        {{ $t("test10", { num: 10 }) }}
        {{ $t(  (((((((((('test11')))))))))) ) }}
        {{ $t(  
            'test12'
            )
        }}
        {{
            $tc(
                    'test12',
                    channels.length,
                    { data: this.$t('hello') }
                )
        }}
  </div>
</template>
