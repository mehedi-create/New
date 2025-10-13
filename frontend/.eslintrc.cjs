// frontend/.eslintrc.cjs
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react', '@typescript-eslint', 'react-refresh'],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // React 17+ with new JSX transform doesn't require React in scope
    'react/react-in-jsx-scope': 'off',
    // Helpful during dev; you can turn off in production builds
    'no-console': 'off',
    // Vite React fast-refresh rule
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // TS preferences
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.config.*',
    '**/*.d.ts'
  ],
};
