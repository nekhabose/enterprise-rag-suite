module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>', '<rootDir>/../tests'],
  testMatch: ['**/integration/**/*.test.js'],
  testTimeout: 180000,
  maxWorkers: 1,
  verbose: true,
  setupFiles: ['dotenv/config'],
  moduleFileExtensions: ['js', 'json']
};
