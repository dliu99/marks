const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    ignores: ['**/dist/**', '**/build/**', '**/.wrangler/**'],
  },
  expoConfig,
  {
    rules: {
      'react/display-name': 'off',
    },
  },
  {
    files: ['api/src/**/*.{js,jsx,ts,tsx}'],
    settings: {
      'import/core-modules': ['cloudflare:workers'],
    },
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  {
    files: ['components/ui/icon/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'import/no-duplicates': 'off',
    },
  },
]);
