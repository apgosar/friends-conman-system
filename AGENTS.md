<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Shell / Command Execution Rules

- All commands will run in PowerShell, so write commands in PowerShell-friendly syntax.
- **Exception**: When SSHed into an EC2 instance, use `tcsh` syntax.
