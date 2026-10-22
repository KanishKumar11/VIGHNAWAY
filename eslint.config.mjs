// Root ESLint config for the shared packages. Apps carry their own configs (Expo, Next).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/**', '**/*.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/{contracts,engine,scenario-data}/src/**/*.ts'],
    rules: {
      // The engine must never read a clock or use randomness (BUILD_PROMPT section 4).
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass simulation time in; never read the clock.' },
        { object: 'Math', property: 'random', message: 'No randomness in the decision path.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Pass simulation time in; never read the clock.' },
        { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]", message: 'Colours live in packages/tokens only.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'fs', 'path', 'crypto', 'react', 'react-native'] },
      ],
    },
  },
  {
    files: ['packages/*/test/**/*.ts', 'packages/*/scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
