import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // eslint-plugin-react-hooks v7 added this to its recommended preset. It
      // fires on 20 sites here, all the same shape: an effect calls an async
      // loader that resets state synchronously before awaiting. Each one is a
      // small extra render on mount, not a bug — and the real fix is to move
      // the reset out of the mount path per screen, which is a deliberate
      // refactor rather than a mechanical one. Kept as a warning so the debt
      // stays visible instead of being silenced.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
