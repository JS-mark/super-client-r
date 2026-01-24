import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  ignores: ['.trae/**'],
  rules: {
    'no-console': 'off',
    'react-refresh/only-export-components': 'warn',
  },
})
