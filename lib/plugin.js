var Middleware = require('./middleware');
var istanbul = require('istanbul');
var express = require('express');

/**
 * Tracks coverage objects and writes results by listening to events
 * emitted from wct test runner. It will avoid writing results if executed
 * in a child process environment. That is handled by parent process
 */

function Listener(emitter, pluginOptions) {
	this.options = pluginOptions;
	this.collector = new istanbul.Collector();
	const usingChildProcesses = process.env.usingChildProcesses === 'true';

	emitter.on('sub-suite-end', function(browser, data) {
		if (data && data.__coverage__) {
			if (usingChildProcesses) {
				process.send(data.__coverage__);
			} else {
				this.collector.add(data.__coverage__);
			}
		}
	}.bind(this));

	emitter.on('run-end', function(error) {
		if (error || usingChildProcesses)
			return;

		const reporter = new istanbul.Reporter(false, this.options.dir);
		reporter.addAll(this.options.reporters);
		reporter.write(this.collector, true, function() {});
	}.bind(this));

	emitter.hook('define:webserver', (app, assign, options, done) => {
		const newApp = express();
		const root = '/components/' + options.packageName + '/';
		const middleware = new Middleware(root, this.options);
		newApp.get('*', (request, response, next) => {
			middleware.execute(request, response, next);
		});
		newApp.use(app);
		assign(newApp);
		done();
	});

};

module.exports = Listener;
