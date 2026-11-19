// @ts-check
// gradus FE — ESLint flat config (P0 governance scaffold — 2026-07-06)
// KÍCH HOẠT: cần cài bộ devDependencies của ESLint (eslint, typescript-eslint, angular-eslint) trước — CHƯA active trong package.json của vỏ mới.
// Chiến lược RATCHET: phần lớn rule = 'warn' để KHÔNG vỡ codebase legacy;
//   siết dần lên 'error' khi đã dọn. lint-staged chỉ lint file thay đổi.
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**', 'node_modules/**', 'coverage/**', '.angular/**',
      'src/app/platform/vendor/**', // 3rd-party vendored (nếu có)
      'src/assets/**', 'public/**', '**/*.min.js',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // gradus dùng nhiều prefix component: app-*, g-*, ct-*
      '@angular-eslint/directive-selector': ['warn', { type: 'attribute', prefix: ['app', 'g', 'ct'], style: 'camelCase' }],
      '@angular-eslint/component-selector': ['warn', { type: 'element', prefix: ['app', 'g', 'ct'], style: 'kebab-case' }],
      // RATCHET legacy-friendly (warn → siết 'error' sau khi dọn)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-inferrable-types': 'off',
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.html'],
    ignores: ['src/app/platform/doc/**'], // trang showcase — không gate
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility, // a11y lint (P1 bonus)
    ],
    rules: {
      // a11y = 'warn' ban đầu (ratchet lên 'error' khi dọn) — hạt giống P1
      '@angular-eslint/template/click-events-have-key-events': 'warn',
      '@angular-eslint/template/interactive-supports-focus': 'warn',
      '@angular-eslint/template/label-has-associated-control': 'warn',
    },
  },
);
