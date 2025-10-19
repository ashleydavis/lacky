module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.ts'],
    moduleNameMapper: {
        '^ora$': '<rootDir>/src/__mocks__/ora.js',
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
};
