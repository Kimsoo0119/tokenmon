const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'assets/'] },

  js.configs.recommended,

  {
    // 메인 프로세스와 순수 Node 모듈, 테스트, 빌드 스크립트, 이 설정 파일
    files: ['src/**/*.js', 'scripts/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },

  {
    // 렌더러는 nodeIntegration이 켜져 있어 Node와 브라우저 전역이 함께 존재합니다
    files: ['src/pet/*.js', 'src/panel/*.js', 'src/settings/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
