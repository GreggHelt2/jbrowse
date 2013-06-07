var profile = {
    basePath: ".",
    releaseDir: './release',
    packages: [
        { name: 'WebApollo', location: 'plugins/WebApollo/js' },
        { name: 'dojo',      location: '../jbrowse/src/dojo' },
        { name: 'dijit',     location: '../jbrowse/src/dijit' },
        { name: 'dojox',     location: '../jbrowse/src/dojox' },
        { name: 'jqueryui',  location: 'plugins/WebApollo/jslib/jqueryui' },
        { name: 'jquery',    location: 'plugins/WebApollo/jslib/jquery', main: 'jquery' }
    ],

    mini: true,
    layerOptimize: 'closure',
    stripConsole: 'normal',
    optimize: 'closure',
    selectorEngine: 'acme',
    staticHasFeatures: {
        // The trace & log APIs are used for debugging the loader, so we don’t need them in the build
        'dojo-trace-api':0,
        'dojo-log-api':0,

        // This causes normally private loader data to be exposed for debugging, so we don’t need that either
        'dojo-publish-privates':0,

        // We’re fully async, so get rid of the legacy loader
        'dojo-sync-loader':0,

        // dojo-xhr-factory relies on dojo-sync-loader
        'dojo-xhr-factory':0,

        // We aren’t loading tests in production
        'dojo-test-sniff':0
    }
};