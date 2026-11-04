export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // El cuerpo y el asunto van en español; se desactiva la regla de mayúsculas pensada para inglés.
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'scope-enum': [
      1,
      'always',
      [
        'repo',
        'deps',
        'ci',
        'docker',
        'docs',
        'shared',
        'web',
        'api',
        'contracts',
        'access',
        'organizations',
        'people',
        'events',
        'attendance',
        'certificates',
        'inventory',
        'loans',
        'notifications',
        'reports',
      ],
    ],
  },
};
