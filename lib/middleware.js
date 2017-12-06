var _ = require('lodash');
var minimatch = require('minimatch');
var fs = require('fs');
var path = require('path');
var istanbul = require('istanbul');
var parseurl = require('parseurl');
var scriptHook = require('html-script-hook');

// istanbul
var instrumenter = new istanbul.Instrumenter({
	coverageVariable: "WCT.share.__coverage__"
});

// helpers
var cache = {};

function instrumentHtml(htmlFilePath, req) {
	var asset = req.url;
	var html;

	if (!cache[asset]) {
		html = fs.readFileSync(htmlFilePath, 'utf8');

		cache[asset] = scriptHook(html, {scriptCallback: gotScript});
	}

	function gotScript(code, loc) {
		return instrumenter.instrumentSync(code, htmlFilePath);
	}

	return cache[asset];
}

function instrumentAsset(assetPath, req) {
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
 * Middleware that serves an instrumented asset based on user
 * configuration of coverage
 */
class Middleware {
	constructor(root, options, emitter) {
		this.root = root;
		this.options = options;
		this.emitter = emitter;
		this.mappings = emitter.options.webserver.pathMappings;
		this.waterfall = _buildWaterfall(this.mappings, this.root);
	}

	execute(req, res, next) {
		var absolutePath = _getFilePathFromWaterfall(this.waterfall, req);
		var relativePath = absolutePath.replace(this.root, '');
		// always ignore platform files in addition to user's blacklist
		var blacklist = ['/web-component-tester/*'].concat(this.options.exclude);
		var whitelist = this.options.include;

		// check asset against rules
		var process = match(relativePath, whitelist) && !match(relativePath, blacklist);
		// instrument unfiltered assets
		if (process) {
			if (absolutePath.match(/\.htm(l)?$/)) {
				return res.send(instrumentHtml(relativePath, req));
			}

			return res.send(instrumentAsset(relativePath, req));
		} else {
			this.emitter.emit('log:debug', 'coverage', 'skip      ', relativePath);
			return next();
		}
	}

	clearCache() {
		cache = {};
	}
}

/**
 * Returns true if the supplied string mini-matches any of the supplied patterns
 */
function match(str, rules) {
	return _.some(rules, minimatch.bind(null, str));
}

function _getFilePathFromWaterfall(waterfall, request) {
	var requestPath = parseurl(request).pathname;
	var pathLookup = _.find(waterfall, function (pathLookup) {
		return requestPath.indexOf(pathLookup.prefix) === 0;
	});

	if (!pathLookup)
		return requestPath;

	return requestPath.replace(pathLookup.prefix, pathLookup.target);
}

// Lifted from https://github.com/PolymerLabs/serve-waterfall
/**
 * @param {Mappings} mappings The mappings to serve.
 * @param {string} root The root directory paths are relative to.
 * @return {Array<{prefix: string, target: string}>}
 */
function _buildWaterfall(pathLookups, root) {
	var basename = path.basename(root);

	var waterfall = _.map(pathLookups, function (pathLookup) {
		var prefix = Object.keys(pathLookup)[0];
		var suffix = (_.endsWith(prefix, '/')) ? '/' : '';
		return {
			prefix: prefix.replace('<basename>', basename),
			target: path.resolve(root, pathLookup[prefix]) + suffix,
		};
	});

	return waterfall;
}

module.exports = Middleware;