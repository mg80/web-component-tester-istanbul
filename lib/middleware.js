var _ = require('lodash');
var minimatch = require('minimatch');
var fs = require('fs');
var path = require('path');
var istanbul = require('istanbul');
var parseurl = require('parseurl');

// istanbul
var instrumenter = new istanbul.Instrumenter({
	coverageVariable: "WCT.share.__coverage__"
});

// helpers
var cache = {};

/**
 * Reads the file and will modify the file to enable code coverage reporting
 * @param assetPath The file path to the resource file
 * @param req Original request to retrieve a resource file
 * @returns {*}
 */
function instrumentFile(assetPath, req) {
	var asset = req.url;
	var code;

	if (!cache[asset]) {
		code = fs.readFileSync(assetPath, 'utf8');

		// NOTE: the instrumenter must get a file system path not a wct-webserver path.
		// If given a webserver path it will still generate coverage, but some reporters
		// will error, siting that files were not found
		// (thedeeno)
		cache[asset] = instrumenter.instrumentSync(code, assetPath);
	}

	return cache[asset];
}

/**
 * Determines if requested resource should be modified for code coverage and instruments it
 */
class Middleware {
	constructor(root, options) {
		this.root = root;
		this.options = options;
	}

	/**
	 * Intercepts resource loading and will instrument files that are required to track code coverage
	 * @param req Request to receive a resource from web-component-tester
	 * @param res Response that returns a modified resource file
	 * @param next Skips instrumenting the file and returns an unmodified resource
	 * @returns {*}
	 */
	execute(req, res, next) {
		var requestPath = parseurl(req).pathname;
		var relativePath = requestPath.replace(this.root, '');

		var blacklist = this.options.exclude;
		var whitelist = this.options.include;

		var foundMatchingFile = match(relativePath, whitelist) && !match(relativePath, blacklist);
		if (foundMatchingFile) {
			return res.send(instrumentFile(relativePath, req));
		} else {
			return next();
		}
	}
}

/**
 * Returns true if the supplied string mini-matches any of the supplied patterns
 */
function match(str, rules) {
	return _.some(rules, minimatch.bind(null, str));
}

module.exports = Middleware;