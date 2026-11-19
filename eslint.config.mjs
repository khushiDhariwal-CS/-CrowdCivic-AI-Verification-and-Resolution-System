import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['.next/**', '.next-dev/**', 'dist/**', 'node_modules/**', 'out/**', 'build/**'],
  },
  {
    rules: {
      'no-unused-vars': 'warn',
    },
  },
  {
    files: ['**/*.rules'],
    plugins: {
      '@firebase/security-rules': firebaseRulesPlugin,
    },
    languageOptions: {
      parser: firebaseRulesPlugin.parser,
    },
    rules: {
      '@firebase/security-rules/no-open-reads': 'error',
      '@firebase/security-rules/no-open-writes': 'error',
      '@firebase/security-rules/no-redundant-matches': 'error',
    },
  },
];
