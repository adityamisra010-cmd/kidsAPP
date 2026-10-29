module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/android/', '/ios/', '/supabase/', '/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/', '<rootDir>/dist/', '<rootDir>/android/'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
