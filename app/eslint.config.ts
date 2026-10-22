import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'
import type { Rule } from 'eslint'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

{
    plugins: {
        local: {
          rules: {
            'no-try-catch-fallback': {
              create(context: Rule.RuleContext): Rule.NodeListener {
                return {
                  CatchClause(node : Rule.Node) {
                    if (node.type === 'CatchClause') {
                      const body = node.body.body;
                      if (body.length === 1 && body[0].type === 'ReturnStatement') {
                        context.report({
                          node,
                          message: 'Avoid using try/catch blocks for control flow or returning fallback values.'
                        });
                    }
                  }
                }
              };
            }
          }
        }
      }
    },
    rules: {
      'local/no-try-catch-fallback': 'error',

      //  DISABLE RULES GLOBALLY HERE
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },

  skipFormatting,
)