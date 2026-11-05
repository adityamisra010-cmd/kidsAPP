const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep agent worktrees, generated native folders and backend code out of the bundler's view.
const sep = '[/\\\\]';
const root = __dirname.replace(/[/\\]/g, sep).replace(/\./g, '\\.');
config.resolver.blockList = [
  new RegExp(`^${root}${sep}\\.claude${sep}.*`),
  new RegExp(`^${root}${sep}(android|ios|supabase|dist|scripts)${sep}.*`),
];

module.exports = config;
