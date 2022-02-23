const sass = require('sass');
const chokidar = require('chokidar');
const vfs = require('vinyl-fs');
const sourcemaps = require('gulp-sourcemaps');
const gulpIf = require('gulp-if');
const cleanCSS = require('gulp-clean-css');
const prefix = require('gulp-autoprefixer');
const chalk = require('chalk');
const _debounce = require('lodash.debounce');
const path = require('path');
const map = require('map-stream');
const remap = function(file, cb) {
    file.path = path.parse(file.path).base;
    cb(null, file);
};
const PLUGIN_NAME = 'Eleventy-Plugin-Sass';
const PLUGIN_SHORT = 'PS';
const defaultOptions = {
    watch: ['**/*.{scss,sass}', '!node_modules/**'],
    sourcemaps: false,
    cleanCSS: true,
    cleanCSSOptions: {},
    sassOptions: {},
    autoprefixer: true,
    outputDir: undefined,
    remap: false
};

function monkeypatch(cls, fn) {
    const orig = cls.prototype[fn.name][`_${PLUGIN_SHORT}_original`] || cls.prototype[fn.name];
    function wrapped() {
        return fn.bind(this, orig).apply(this, arguments);
    }
    wrapped[`_${PLUGIN_SHORT}_original`] = orig;

    cls.prototype[fn.name] = wrapped;
}

const compileSass = _debounce(function(eleventyInstance, options) {
    console.log(`[${chalk.red(PLUGIN_NAME)}] Compiling Sass files...`);
    vfs.src(options.watch)
        .pipe(gulpIf(options.sourcemaps, sourcemaps.init()))
        .pipe(sass(options.sassOptions).on('error', sass.logError))
        .pipe(gulpIf(options.autoprefixer, prefix()))
        .pipe(gulpIf(options.cleanCSS, cleanCSS(options.cleanCSSOptions)))
        .pipe(gulpIf(options.sourcemaps, sourcemaps.write('.')))
        .pipe(gulpIf(options.remap, map(remap)))
        .pipe(vfs.dest( (options.outputDir || eleventyInstance.outputDir), {nodir: true} ))
        .on('end', function() {
            console.log(`[${chalk.red(PLUGIN_NAME)}] Done compiling Sass files`);
            eleventyInstance.eleventyServe.reload();
        });
}, 500);

function initializeWatcher(eleventyInstance, options) {
    let firstRun = true;
    const watcher = chokidar.watch(options.watch, {
        persistent: true
    });
    watcher
        .on('add', path => {
            if (!firstRun) {
            }
            firstRun = false;
            compileSass(eleventyInstance, options);
        })
        .on('change', path => {
            compileSass(eleventyInstance, options);
        });
}

module.exports = {
    initArguments: {},
    configFunction: function(eleventyConfig, options) {
        setImmediate(function() {
            options = { ...defaultOptions, ...options };
            let initialized = false;
            const Eleventy = require('@11ty/eleventy/src/Eleventy.js');
            if (Eleventy.prototype) {
                function write(original) {
                    if (!initialized && !this.isDryRun) {
                        compileSass(this, options);
                    }
                    return original.apply(this);
                }
                function watch(original) {
                    if (!initialized) {
                        initializeWatcher(this, options);
                        initialized = true;
                    }
                    return original.apply(this);
                }
                function serve(original, port) {
                    if (!initialized) {
                        initializeWatcher(this, options);
                        initialized = true;
                    }
                    return original.apply(this, [port]);
                }
                monkeypatch(Eleventy, write);
                monkeypatch(Eleventy, watch);
                monkeypatch(Eleventy, serve);
            }
        });
    }
};
