#!/usr/bin/env node

/**
 * Ghostly CLI - Standalone Terminal Memory CLI
 * Better shell integration with commander
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple JSON-based storage (no deps on ghostly-core for standalone)
const DATA_DIR = join(process.env.HOME || process.env.USERPROFILE, '.ghostly');
const DB_FILE = join(DATA_DIR, 'memory.json');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load memory database
 */
function loadDB() {
  if (existsSync(DB_FILE)) {
    return JSON.parse(readFileSync(DB_FILE, 'utf8'));
  }
  return { events: [], episodes: [], projects: [] };
}

/**
 * Save memory database
 */
function saveDB(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/**
 * Generate project hash
 */
function getProjectHash(cwd) {
  return createHash('md5').update(cwd).digest('hex').substring(0, 8);
}

/**
 * Get git branch
 */
async function getGitBranch(cwd) {
  try {
    const git = simpleGit(cwd);
    const branch = await git.branch();
    return branch.current;
  } catch {
    return null;
  }
}

/**
 * Capture command event
 */
async function captureCommand(args) {
  const db = loadDB();
  const cwd = process.cwd();
  const command = args.join(' ');
  const branch = await getGitBranch(cwd);
  const projectHash = getProjectHash(cwd);
  const timestamp = new Date().toISOString();
  
  // Extract exit code if provided
  let exitCode = 0;
  let stderr = '';
  
  const exitIdx = args.indexOf('--exit-code');
  if (exitIdx > -1 && args[exitIdx + 1]) {
    exitCode = parseInt(args[exitIdx + 1]) || 0;
  }
  
  const stderrIdx = args.indexOf('--stderr');
  if (stderrIdx > -1 && args[stderrIdx + 1]) {
    stderr = args[stderrIdx + 1];
  }
  
  // Check for error patterns
  const errorPatterns = ['error', 'fail', 'exception', 'not found', 'cannot'];
  const isError = exitCode !== 0 || errorPatterns.some(p => stderr.toLowerCase().includes(p));
  
  const event = {
    id: uuidv4(),
    timestamp,
    cwd,
    git_branch: branch,
    command,
    exit_code: exitCode,
    stderr,
    project_hash: projectHash,
    is_error: isError
  };
  
  // Update or create project
  let project = db.projects.find(p => p.hash === projectHash);
  if (!project) {
    project = {
      hash: projectHash,
      name: cwd.split('/').pop(),
      root: cwd,
      first_seen: timestamp,
      last_seen: timestamp
    };
    db.projects.push(project);
  } else {
    project.last_seen = timestamp;
  }
  
  // Only store significant events
  if (isError || isImportantCommand(command)) {
    const episode = {
      id: uuidv4(),
      project_hash: projectHash,
      timestamp,
      summary: `${command.split(' ')[0]} - ${isError ? 'error' : 'success'}`,
      problem: isError ? stderr.substring(0, 200) : null,
      fix: command,
      keywords: extractKeywords(command, cwd)
    };
    
    db.episodes.push(episode);
    console.log(chalk.green('✓ ') + 'Episode saved: ' + chalk.gray(command.substring(0, 40)));
  }
  
  db.events.push(event);
  saveDB(db);
  
  // Show suggestion if error
  if (isError) {
    const pastFixes = db.episodes
      .filter(e => e.project_hash === projectHash && e.fix)
      .slice(-3);
    
    if (pastFixes.length > 0) {
      console.log(chalk.yellow('\n💡 Past fixes:'));
      pastFixes.forEach(f => {
        console.log(chalk.cyan('  → ') + f.fix);
      });
    }
  }
}

/**
 * Check if command is important
 */
function isImportantCommand(cmd) {
  const important = ['npm', 'yarn', 'pnpm', 'git', 'docker', 'kubectl', 'python', 'cargo', 'go', 'make', 'gradle', 'mvn'];
  return important.some(c => cmd.startsWith(c));
}

/**
 * Extract keywords
 */
function extractKeywords(cmd, cwd) {
  const keywords = [cmd.split(' ')[0]];
  const projectName = cwd.split('/').pop();
  if (projectName) keywords.push(projectName);
  return keywords.join(', ');
}

/**
 * Search memories
 */
function searchMemories(query) {
  const db = loadDB();
  const results = db.episodes.filter(e => 
    e.summary?.toLowerCase().includes(query.toLowerCase()) ||
    e.problem?.toLowerCase().includes(query.toLowerCase()) ||
    e.fix?.toLowerCase().includes(query.toLowerCase())
  ).slice(-10);
  
  if (results.length === 0) {
    console.log(chalk.gray('No memories found.'));
    return;
  }
  
  console.log(chalk.cyan(`\nFound ${results.length} memories:\n`));
  results.reverse().forEach((r, i) => {
    console.log(chalk.yellow(`${i + 1}. `) + chalk.white(r.summary));
    if (r.problem) console.log(chalk.red('   Problem: ') + r.problem.substring(0, 60));
    if (r.fix) console.log(chalk.green('   Fix: ') + r.fix.substring(0, 60));
    console.log();
  });
}

/**
 * Show statistics
 */
function showStats() {
  const db = loadDB();
  console.log(chalk.cyan('\n📊 Ghostly CLI Statistics'));
  console.log(chalk.gray('─'.repeat(30)));
  console.log(`Events:   ${db.events.length}`);
  console.log(`Episodes: ${db.episodes.length}`);
  console.log(`Projects: ${db.projects.length}`);
  console.log(chalk.gray('─'.repeat(30)) + '\n');
}

/**
 * Interactive mode
 */
async function interactiveMode() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        'Capture last command',
        'Search memories',
        'View stats',
        'Exit'
      ]
    }
  ]);
  
  switch (action) {
    case 'Capture last command':
      const { cmd } = await inquirer.prompt([
        { type: 'input', name: 'cmd', message: 'Command:' }
      ]);
      await captureCommand([cmd]);
      break;
    case 'Search memories':
      const { query } = await inquirer.prompt([
        { type: 'input', name: 'query', message: 'Search:' }
      ]);
      searchMemories(query);
      break;
    case 'View stats':
      showStats();
      break;
  }
}

// Main CLI
const program = new Command();

program
  .name('ghostly')
  .description('Terminal memory CLI - remember your commands')
  .version('0.1.0');

program
  .command('capture <cmd...>')
  .description('Capture a terminal command')
  .action(captureCommand);

program
  .command('search <query>')
  .description('Search past memories')
  .action(searchMemories);

program
  .command('stats')
  .description('Show memory statistics')
  .action(showStats);

program
  .command('init')
  .description('Initialize ghostly storage')
  .action(() => {
    loadDB(); // Creates file if not exists
    console.log(chalk.green('✓ ') + 'Ghostly initialized at ' + DATA_DIR);
  });

program
  .command('interactive')
  .alias('i')
  .description('Interactive mode')
  .action(interactiveMode);

program.parse();
