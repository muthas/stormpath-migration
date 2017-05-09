var matches = process.version.match(/v([0-9]+)\.([0-9]+)/);

var major = parseInt(matches[1]);

var minor = parseInt(matches[2]);

if (major >= 7 && minor >= 6) {
  require('./migrate');
} else {
  console.error('Node v7.6 or greater is required');
  process.exit(1);
}