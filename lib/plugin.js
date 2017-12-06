var Middleware = require('./middleware');
var istanbul = require('istanbul');
var Validator = require('./validator');
var express = require('express');
var sync = true;

/**
 * Tracks coverage objects and writes results by listening to events
 * emitted from wct test runner.
 */

function Listener(emitter, pluginOptions) {
	this.options = pluginOptions;
	this.collector = new istanbul.Collector();
	this.reporter = new istanbul.Reporter(false, this.options.dir);
	this.validator = new Validator(this.options.thresholds);
	this.reporter.addAll(this.options.reporters);
	const usingChildProcesses = process.env.usingChildProcesses === 'true';

	emitter.on('sub-suite-end', function(browser, data) {
		if (data && data.__coverage__) {
			if (usingChildProcesses) {
				process.send(data.__coverage__);
			}
			this.collector.add(data.__coverage__);
		}
	}.bind(this));

	emitter.on('run-end', function(error) {
		if (!error && !usingChildProcesses) {
			this.reporter.write(this.collector, sync, function() {});

			if (!this.validator.validate(this.collector)) {
				throw new Error('Coverage failed');
			}
		}
	}.bind(this));

	emitter.hook('define:webserver', (app, assign, options, done) => {
		const newApp = express();
		const middleware = new Middleware('/components/salesforce-cpq/', this.options, emitter);
		newApp.get('*', (request, response, next) => {
			middleware.execute(request, response, next);
		});
		newApp.use(app);
		assign(newApp);
		done();
	});

};

module.exports = Listener;
