#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var child_process = require('child_process')
var stdin = require('stdin')
var pkg = require('../package.json')
var stylefmt = require('../')

var minimist = require('minimist')
var argv = minimist(process.argv.slice(2), {
  boolean: [
    'help',
    'version'
  ],
  alias: {
    b: 'config-basedir',
    c: 'config',
    d: 'diff',
    h: 'help',
    i: 'ignore-path',
    id: 'ignore-disables',
    l: 'list',
    R: 'recursive',
    v: 'version',
  }
})

var tmp = require('tmp')
var postcss = require('postcss')
var scss = require('postcss-scss')

if (argv.v) {
  console.log(pkg.version)
  process.exit()
}

if (argv.h) {
  console.log('Usage: stylefmt [options] input-name [output-name]')
  console.log('')
  console.log('Options:')
  console.log('')
  console.log('  -d, --diff             Output diff against original file')
  console.log('  -l, --list             Format list of space seperated files in place')
  console.log('  -R, --recursive        Format files recursively')
  console.log('  -c, --config           Path to a specific configuration file (JSON, YAML, or CommonJS)')
  console.log('  -b, --config-basedir   Path to the directory that relative paths defining "extends"')
  console.log('  -v, --version          Output the version number')
  console.log('  -h, --help             Output usage information')
  console.log('  -i, --ignore-path      Path to a file containing patterns that describe files to ignore.')
  console.log('  -id --ignore-disables  Ignore disables')
  console.log('  --stdin-filename       A filename to assign stdin input.')
}


var options = {}
if (argv.c) {
  options.configFile = argv.c
}

if (argv.b) {
  options.configBasedir = (path.isAbsolute(argv.b))
    ? argv.b
    : path.resolve(process.cwd(), argv.b)
}

if (argv.i) {
  options.ignorePath = argv.i
}

if (argv.id) {
  options.ignoreDisables = argv.id
}

if (argv.l) {
  var files = [argv.l].concat(argv._)
  processMultipleFiles(files)
} else if (argv._[0]) {
  var input = path.resolve(process.cwd(), argv._[0])
  var output = argv._[1] || argv._[0]

  var css = fs.readFileSync(input, 'utf-8')

  postcss([stylefmt(options)])
    .process(css, {
      from: input,
      syntax: scss
    })
    .then(function (result) {
      var formatted = result.css
      if (argv.d) {
        var fullPath = path.resolve(process.cwd(), input)
        handleDiff(fullPath, input, formatted)
      } else {
        if (css !== formatted) {
          fs.writeFile(output, formatted, function (err) {
            if (err) {
              throw err
            }
          })
        }
      }
    })
} else if (argv.R) {
  var recursive = require('recursive-readdir')

  recursive(argv.R, function (err, files) {
    processMultipleFiles(files)
  })
} else {

  stdin(function (css) {
    options.codeFilename = argv['stdin-filename']
    postcss([stylefmt(options)])
      .process(css, {
        from: options.codeFilename,
        syntax: scss
      })
      .then(function (result) {
        process.stdout.write(result.css)
      })
  })
}


function processMultipleFiles (files) {
  files.forEach(function (file) {
    var fullPath = path.resolve(process.cwd(), file)
    if (!isCss(fullPath)) {
      return
    }

    var css = fs.readFileSync(fullPath, 'utf-8')

    postcss([stylefmt(options)])
      .process(css, {
        from: fullPath,
        syntax: scss
      })
      .then(function (result) {
        var formatted = result.css
        if (css !== formatted) {
          fs.writeFile(fullPath, formatted, function (err) {
            if (err) {
              throw err
            }
          })
        }
      })
  })
}


function isCss (filePath) {
  return /^\.css|\.scss$/i.test(path.extname(filePath))
}


function diff (pathA, pathB, callback) {
  child_process.exec([
    'git', 'diff', '--ignore-space-at-eol', '--no-index', '--', pathA, pathB
  ].join(' '), callback)
}

function handleDiff (fullPath, original, formatted) {
  tmp.file(function (err, tmpPath, fd) {
    if (err) {
      console.error(err)
      return
    }

    fs.writeSync(fd, formatted, function (err) {
      if (err) {
        throw err
      }

      diff(fullPath, tmpPath, function (err, stdout, stderr) {
        if (stdout) {
          console.log(stdout)
        }
        if (stderr) {
          console.error(stderr)
        }
      })
    })
  })
}
