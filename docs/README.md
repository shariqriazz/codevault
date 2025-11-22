# CodeVault Documentation

Complete documentation for CodeVault - AI-powered semantic code search via MCP.

## 📚 Documentation Index

### Getting Started
- **[Main README](../README.md)** - Overview, quick start, features
- **[Configuration Guide](CONFIGURATION.md)** - Complete configuration reference
- **[MCP Setup Guide](MCP_SETUP.md)** - Claude Desktop integration

### Features
- **[Ask Feature Guide](ASK_FEATURE.md)** - LLM-synthesized Q&A
- **[CLI Reference](CLI_REFERENCE.md)** - All commands and options
- **[Advanced Features](ADVANCED.md)** - Chunking, encryption, context packs

### Providers
- **[API Providers Guide](PROVIDERS.md)** - Embedding, chat, and reranking providers

## 🎯 Quick Navigation

### I want to...

**Set up CodeVault**
→ Start with [Main README](../README.md), then [Configuration Guide](CONFIGURATION.md)

**Use with Claude Desktop**
→ See [MCP Setup Guide](MCP_SETUP.md)

**Ask questions about my code**
→ Check [Ask Feature Guide](ASK_FEATURE.md)

**Choose API providers**
→ Read [API Providers Guide](PROVIDERS.md)

**Learn advanced features**
→ Explore [Advanced Features](ADVANCED.md)

**Find specific commands**
→ Browse [CLI Reference](CLI_REFERENCE.md)

## 📖 Documentation by Topic

### Configuration
- [Configuration Guide](CONFIGURATION.md) - Complete config options
- [Environment Variables](CONFIGURATION.md#environment-variables)
- [Config File Format](CONFIGURATION.md#configuration-file-format)
- [Priority Order](CONFIGURATION.md#configuration-priority)

### MCP Integration
- [MCP Setup Guide](MCP_SETUP.md) - Claude Desktop setup
- [Available Tools](MCP_SETUP.md#available-mcp-tools)
- [Config Locations](MCP_SETUP.md#config-file-locations)
- [Troubleshooting](MCP_SETUP.md#troubleshooting)

### Search & Ask
- [Ask Feature](ASK_FEATURE.md) - Natural language Q&A
- [Search Commands](CLI_REFERENCE.md#search-commands)
- [Search Methods](ADVANCED.md#hybrid-search)
- [Reranking](ADVANCED.md#api-reranking)

### Advanced Topics
- [Smart Chunking](ADVANCED.md#smart-chunking-system)
- [Hybrid Search](ADVANCED.md#hybrid-search)
- [Encryption](ADVANCED.md#encryption)
- [Context Packs](ADVANCED.md#context-packs)
- [File Watching](ADVANCED.md#file-watching)
- [Batch Processing](ADVANCED.md#batch-processing)

### API Providers
- [Nebius + Qwen](PROVIDERS.md#nebius-ai-studio-recommended)
- [OpenAI](PROVIDERS.md#openai)
- [Ollama (Local)](PROVIDERS.md#ollama-local)
- [OpenRouter (Chat)](PROVIDERS.md#openrouter-recommended)
- [Novita (Reranking)](PROVIDERS.md#novita-ai-recommended)

## 🔍 Common Tasks

### Initial Setup
1. [Install CodeVault](../README.md#installation)
2. [Configure providers](CONFIGURATION.md#quick-start)
3. [Index your project](CLI_REFERENCE.md#index)

### Daily Usage
1. [Search code](CLI_REFERENCE.md#search)
2. [Ask questions](ASK_FEATURE.md#quick-start)
3. [Watch for changes](CLI_REFERENCE.md#watch)

### Advanced Usage
1. [Create context packs](ADVANCED.md#context-packs)
2. [Enable encryption](ADVANCED.md#encryption)
3. [Optimize performance](ADVANCED.md#performance-tuning)

## 🆘 Getting Help

### Troubleshooting Guides
- [Configuration Issues](CONFIGURATION.md#troubleshooting)
- [MCP Problems](MCP_SETUP.md#troubleshooting)
- [Search Quality](ASK_FEATURE.md#troubleshooting)
- [Provider Errors](PROVIDERS.md#troubleshooting)

### Common Questions

**Q: Which config is being used?**
```bash
codevault config list --sources
```

**Q: How do I improve search quality?**
- Enable reranking: `--reranker on`
- Increase max chunks: `--max-chunks 15`
- Use multi-query: `--multi-query`
- See [Ask Feature Guide](ASK_FEATURE.md#optimizing-results)

**Q: What's the best provider setup?**
- See [Recommended Setup](PROVIDERS.md#recommended-setup)
- Compare [Provider Options](PROVIDERS.md#provider-comparison)

**Q: How do I use local models?**
- Install Ollama: [Local Setup](PROVIDERS.md#ollama-local)
- Configure: [Ollama Example](../examples/ollama-local.example.json)

## 📊 Documentation Map

```
CodeVault/
├── README.md                 # Main overview
├── docs/
│   ├── README.md            # This file
│   ├── CONFIGURATION.md     # Config reference
│   ├── MCP_SETUP.md         # Claude Desktop setup
│   ├── ASK_FEATURE.md       # LLM Q&A guide
│   ├── CLI_REFERENCE.md     # Command reference
│   ├── PROVIDERS.md         # API providers
│   └── ADVANCED.md          # Advanced features
└── examples/
    ├── README.md            # Examples overview
    ├── nebius-openrouter.example.json
    ├── ollama-local.example.json
    └── full-config.example.json
```

## 🔗 External Resources

- **GitHub Repository:** https://github.com/shariqriazz/codevault
- **NPM Package:** https://www.npmjs.com/package/codevault
- **Issue Tracker:** https://github.com/shariqriazz/codevault/issues
- **Model Context Protocol:** https://modelcontextprotocol.io/

## 📝 Contributing to Docs

Found an issue or want to improve the documentation?

1. Fork the repository
2. Edit the relevant `.md` file
3. Submit a pull request

All documentation uses GitHub-flavored Markdown.

---

**Version:** 1.8.3
**Last Updated:** November 2025