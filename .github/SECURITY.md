# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.0.x   | :white_check_mark: |
| < 3.0   | :x:                |

**Recommendation**: Use latest 3.x release for security fixes.

## Reporting a Vulnerability

**DO NOT** open public issues for security vulnerabilities.

**Email**: github@rozpuszczalny.com

Include:
- Extension version
- VS Code/Positron version
- Operating system
- Detailed description
- Reproduction steps (if applicable)
- Proof of concept (if applicable)

**Response Time**: Typically 48-72 hours for acknowledgment.

## Security Features

### API Key Storage
- **v3.0+**: VS Code Secrets API (encrypted, platform-native)
  - Windows: Credential Manager
  - macOS: Keychain
  - Linux: libsecret/gnome-keyring
- **v2.x**: Plaintext settings.json (deprecated, insecure)

### Migrate to v3.0
Run: `Redmine: Set API Key` command to migrate from plaintext storage.

See [Migration Guide](./MIGRATION_GUIDE.md).

### Self-Signed Certificates
`redmine.rejectUnauthorized: false` disables TLS validation.

**Risk**: Man-in-the-middle attacks. Use only for trusted internal servers.

## Known Security Considerations

1. **API Key Scope**: Redmine API keys grant full account access. Extension only performs read operations and limited updates (time entries, status changes).

2. **Network Traffic**: All requests to Redmine server use HTTPS (recommended) or HTTP. No data sent to third parties.

3. **Local Storage**: Server URLs stored in workspace settings (may sync via Settings Sync). API keys never sync.

## Security Best Practices

- Use HTTPS for Redmine server
- Rotate API keys regularly
- Use read-only Redmine accounts if possible
- Review `redmine.additionalHeaders` for sensitive data
- Disable Settings Sync for workspace with sensitive URLs
