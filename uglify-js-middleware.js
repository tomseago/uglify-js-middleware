/**
 * Module dependencies.
 */

var uglify = require('uglify-js');

var jsp = uglify.parser
  , pro = uglify.uglify
  , fs = require('fs')
  , url = require('url')
  , basename = require('path').basename
  , join = require('path').join
  , ENOENT;

// COMPAT:

try {
  ENOENT = require('constants').ENOENT;
} catch (err) {
  ENOENT = process.ENOENT;
}

/**
 * Return Connect middleware with the given `options`.
 *
 * Implementation derived from the Stylus library middleware.
 *
 * @param {Object} options
 * @return {Function}
 * @api public
 */

module.exports = uglify.middleware = function(options) {
  options = options || {};

  //Accept src/dest dir
  if ('string' === typeof options) {
    options = { src: options };
  }

  // Force compilation
  var force = options.force || false;

  // Variable name mangling
  var mangle = options.mangle || true;

  // Code squeezing
  var squeeze = options.squeeze || true;

  // Source dir required
  var src = options.src;
  if (!src) throw new Error('uglify.middleware requires "src" directory');

  // Default dest dir to source
  var dest = options.dest
    ? options.dest
    : src;

  // Whether to "ugly" the extension (default true if same dirs, else false)
  var uglyext = options.uglyext || (src === dest);
  var uglyregex = uglyext ? /\.ugly\.js$/ : /\.js$/;

  return function(req, res, next) {
    if ('GET' != req.method && 'HEAD' != req.method) return next();

    var path = url.parse(req.url).pathname;
    if (uglyregex.test(path)) {
      var uglyPath = join(dest, path)
        , jsPath = join(src, uglyext ? path.replace('.ugly.js', '.js') : path);

      // Ignore ENOENT to fall through as 404
      function error(err) {
        next(ENOENT === err.errno ? null : err);
      }

      if (force) return compile();

      // Compile to uglyPath
      function compile() {
        fs.readFile(jsPath, 'utf8', function(err, str) {
          if (err) return error(err);

          try {
            var ast = jsp.parse(str);
            if (mangle) ast = pro.ast_mangle(ast);
            if (squeeze) ast = pro.ast_squeeze(ast);
            var ugly = pro.gen_code(ast);
            fs.writeFile(uglyPath, ugly, 'utf8', function(err) {
              next(err);
            });
          } catch(ex) {
            return next(ex);
          }
        });
      }

      fs.stat(jsPath, function(err, jsStats) {
        if (err) return error(err);
        fs.stat(uglyPath, function(err, uglyStats) {
          if (err) {
            if (ENOENT === err.errno) {
              // JS has not been uglified, compile it!
              compile();
            } else {
              next();
            }
          } else {
            if (jsStats.mtime > uglyStats.mtime) {
              // Source has changed, compile it!
              compile();
            } else {
              // Already compiled
              next();
            }
          }
        });
      });
    } else {
      next();
    }
  };
}
