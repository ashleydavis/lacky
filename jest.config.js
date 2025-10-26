export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.ts'],
    modulePathIgnorePatterns: [
        "dist",
        "build",
        "bin",
    ],
    moduleNameMapper: {
        '^ora$': '<rootDir>/src/__mocks__/ora.js',
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
};
