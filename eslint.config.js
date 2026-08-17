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
  {
    // Tests run under Node, not in a browser. The base config gives every file
    // `globals.browser` only, so a test that legitimately touches `process`
    // reported `'process' is not defined` — which is the opposite of true here.
    //
    // photoRetention.test.js needs it: the runner's clock is UTC, and every
    // date bug this project has shipped is invisible at offset zero, so the
    // file puts the process in Asia/Jerusalem before asserting anything. Both
    // sets of globals, because these files are also full of DOM.
    files: ['**/*.test.{js,jsx}', 'qa/**/*.{js,jsx,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
])
