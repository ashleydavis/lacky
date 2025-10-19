// Mock for ora spinner library
function ora(options) {
	return {
		start: jest.fn().mockReturnThis(),
		succeed: jest.fn().mockReturnThis(),
		fail: jest.fn().mockReturnThis(),
		warn: jest.fn().mockReturnThis(),
		info: jest.fn().mockReturnThis(),
		stop: jest.fn().mockReturnThis(),
		clear: jest.fn().mockReturnThis(),
		render: jest.fn().mockReturnThis(),
		frame: jest.fn().mockReturnThis(),
		text: '',
		color: 'cyan',
		spinner: 'dots',
		indent: 0,
		isSpinning: false,
		isEnabled: true,
		isSilent: false,
		isDiscarded: false,
		isStopped: false,
	};
}

module.exports = ora;
module.exports.default = ora;
