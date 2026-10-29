module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/', '<rootDir>/android/', '<rootDir>/ios/', '<rootDir>/supabase/', '<rootDir>/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/', '<rootDir>/dist/', '<rootDir>/android/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
