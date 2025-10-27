// Mock for inquirer library
const inquirer = {
	prompt: jest.fn().mockResolvedValue({ selection: 'branch' })
};

module.exports = inquirer;
module.exports.default = inquirer;

