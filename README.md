# Ghostly CLI

> Standalone CLI for terminal memory - better shell integration.

Part of the Ghostly Memory Bank ecosystem - lightweight CLI with JSON storage.

## Install

```bash
npm install -g ghostly-cli
# Or run directly with npx
```

## Usage

```bash
# Initialize
ghostly init

# Capture a command
ghostly capture "npm run build" --stderr "Error" --exit-code 1

# Search memories
ghostly search "npm"

# View stats
ghostly stats

# Interactive mode
ghostly interactive
```

## Features

- Lightweight JSON storage (~/.ghostly/memory.json)
- Error detection and auto-suggestions
- Git branch awareness
- Project-based memory organization
- Interactive mode with inquirer

## Commands

- `ghostly init` - Initialize storage
- `ghostly capture <cmd>` - Capture command
- `ghostly search <query>` - Search memories
- `ghostly stats` - Show statistics
- `ghostly interactive` - Interactive mode

## Shell Integration

Add to your `.bashrc` or `.zshrc`:

```bash
# Auto-capture failed commands
alias gho="ghostly capture"
```

## License

MIT
