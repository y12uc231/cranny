#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const root = path.resolve(__dirname, '..');
const child = spawn(electron, [root, ...process.argv.slice(2)], {
  stdio: 'inherit',
  detached: false,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
