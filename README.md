# lacky

A CLI tool to run a GitHub Actions Workflow locally.


## What it does

1. **YAML Validation**: First validates the YAML syntax of the workflow file
2. **Structure Analysis**: Analyzes the workflow structure and reports:
   - Workflow name
   - Triggers (on events)
   - Jobs defined
   - Warnings for missing elements
3. **Simulation**: Simulates the workflow execution by:
   - Running each job sequentially
   - Displaying job details (runs-on, steps)
   - Simulating step execution with timing
   - Showing step names and types
4. **Interactive Variable Resolution**: Prompts for GitHub context variables with smart defaults:
   - Menu-based selection for known variables (e.g., `github.ref_type` offers "branch" or "tag")
   - Free-text input for custom variables and inputs
   - Caches resolved values to avoid repeated prompts
5. **Workflow Functions Support**: Supports GitHub Actions workflow expression functions:
   - `always()` - Always returns true (runs job/step regardless of previous results)
   - `success()` - Returns true (assumes previous steps/jobs succeeded)
   - `failure()` - Returns false (for testing failure conditions)
   - `cancelled()` - Returns false (for testing cancellation conditions)
6. **Mock Actions**: Supports custom mock actions for testing workflows locally

## Installation

### Pre-built Binaries (Recommended)

Download the latest release for your platform from the [GitHub Releases page](https://github.com/codecapers/lacky/releases).

#### Linux
```bash
# Download and extract
curl -L https://github.com/codecapers/lacky/releases/latest/download/lacky-linux-x64.tar.gz | tar xz

# Make executable and move to PATH
chmod +x lacky
sudo mv lacky /usr/local/bin/
```

#### macOS (Intel)
```bash
# Download and extract
curl -L https://github.com/codecapers/lacky/releases/latest/download/lacky-macos-x64.tar.gz | tar xz

# Remove quarantine attributes (required for unsigned binaries)
xattr -c lacky

# Make executable and move to PATH
chmod +x lacky
sudo mv lacky /usr/local/bin/
```

#### macOS (Apple Silicon)
```bash
# Download and extract
curl -L https://github.com/codecapers/lacky/releases/latest/download/lacky-macos-arm64.tar.gz | tar xz

# Remove quarantine attributes (required for unsigned binaries)
xattr -c lacky

# Make executable and move to PATH
chmod +x lacky
sudo mv lacky /usr/local/bin/
```

**macOS Security Note**: If you encounter "cannot be opened because the developer cannot be verified" or similar security warnings, you need to remove the quarantine attributes that macOS adds to downloaded files:

```bash
xattr -c ./lacky
```

This is required because macOS Gatekeeper automatically quarantines downloaded binaries that aren't code-signed by a registered Apple developer. The `xattr -c` command removes these extended attributes, allowing the binary to run normally. This is safe for trusted binaries like lacky.

#### Windows
1. Download `lacky-windows-x64.zip` from the [releases page](https://github.com/codecapers/lacky/releases)
2. Extract the archive
3. Add the extracted folder to your PATH or run `lacky.exe` directly

### Development Installation

If you want to build from source or contribute to development:

```bash
# Clone the repository
git clone https://github.com/codecapers/lacky.git
cd lacky

# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Run in development mode
bun run dev -- workflow.yml
```

## Usage

### Basic Usage

```bash
# Run a workflow file
lacky .github/workflows/test.yml

# Preview mode (dry-run) - shows what commands would be executed
lacky --dry-run .github/workflows/test.yml

# Show version
lacky --version

# Show help
lacky --help
```

### Development Mode (from source)

```bash
# Run with hot reload
bun run dev -- <workflow-file>

# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Type check
bun run compile
```

## Interactive Variable Resolution

When lacky encounters GitHub context variables in your workflow (like `${{ github.ref_type }}`), it will interactively prompt you for values using Inquirer for an enhanced user experience. For known variables with specific valid options, lacky presents an interactive menu to choose from:

### Menu-Based Variables

The following variables offer interactive menu-based selection:

- **`github.ref_type`**: Choose between "branch" or "tag"
- **`github.event_name`**: Choose from common event types like "push", "pull_request", "workflow_dispatch", etc.

Example interaction:
```
? Select value for 'github.ref_type': (Use arrow keys)
❯ branch
  tag

      🔧 Resolved github.ref_type = "branch"
```

### Free-Text Input Variables

Other variables will prompt for free-text input with helpful placeholders:
- **`github.ref_name`**: Branch or tag name (e.g., `main`)
- **`github.sha`**: Commit SHA (e.g., `abc123def456`)
- **`github.workspace`**: Workspace path (e.g., `/home/runner/work/repo/repo`)
- **`github.event.inputs.*`**: Workflow dispatch inputs (e.g., `my-value`)
- **`env.*`**: Environment variables (e.g., `value`)

Example interaction:
```
? Enter branch/tag name (main)
```

Press Enter to use the default placeholder value, or type your own value.

### Variable Caching

Once you provide a value for a variable, lacky caches it for the duration of the workflow execution. This means you won't be prompted multiple times for the same variable.

### Try It Out

You can test the interactive variable resolution with the included example workflow:

```bash
lacky examples/example-workflow.yml
```

This will prompt you to select values for `github.ref_type` and `github.event_name`, demonstrating the menu-based selection feature.

## Mock Actions

Lacky supports creating mock actions to simulate custom GitHub Actions locally. This is particularly useful for testing workflows that depend on external actions that aren't available in your local environment.

### Creating Mock Actions

To create a mock action, follow these steps:

1. **Create the mock directory structure**:
   ```
   .github/
   └── workflows/
       └── mocks/
           └── {workflow-name}/
               └── {action-name}.js
   ```

2. **Name your mock file**: Convert the action name to a filename by replacing `/` with `-`:
   - `tj-actions/changed-files` → `tj-actions-changed-files.js`
   - `actions/checkout` → `actions-checkout.js`
   - `my-org/my-action` → `my-org-my-action.js`

3. **Create the mock function**: Your mock file should export a function that returns the expected outputs:

   ```javascript
   // .github/workflows/mocks/my-workflow.yml/tj-actions-changed-files.js
   export default async function mockChangedFiles({ step, workflow, workingDir, stepId, isDryRun }) {
       // Return the mocked outputs
       return {
           all_changed_files: 'path/to/changed/file.txt',
           any_changed: 'true',
           only_modified: 'false'
       };
   };
   ```

### Mock Function Parameters

The mock function receives the following parameters:

- `step`: The workflow step object containing the action configuration
- `workflow`: The entire workflow object
- `workingDir`: The working directory for the step
- `stepId`: The unique identifier for the step
- `isDryRun`: Boolean indicating if this is a dry run

### Example: Mock for tj-actions/changed-files

```javascript
// .github/workflows/mocks/validate-tf-route-53-plan.yaml/tj-actions-changed-files.js
export default async function mockChangedFiles({ step, workflow, workingDir, stepId, isDryRun }) {
    // Return the mocked outputs
    return {
        all_changed_files: 'the/changed/file'
    };
};
```

### How Mock Actions Work

1. When lacky encounters a step with a `uses` property, it looks for a corresponding mock file
2. If a mock file exists, it loads and executes the mock function
3. The mock function's return value is used as the step's outputs
4. These outputs can be referenced in subsequent steps using `${{ steps.step-id.outputs.output-name }}`
5. If no mock file exists, lacky displays an informational message and continues

### Mock File Location

The mock system looks for mock files in this pattern:
```
.github/workflows/mocks/{workflow-filename-without-extension}/{action-name}.js
```

For example, if your workflow file is `validate-tf-route-53-plan.yaml` and you want to mock `tj-actions/changed-files`, create:
```
.github/workflows/mocks/validate-tf-route-53-plan.yaml/tj-actions-changed-files.js
```

## Development Scripts

- `bun run dev` - Run in development mode with hot reload
- `bun run start` - Run directly with Bun
- `bun run build` - Build TypeScript (type checking)
- `bun run test` - Run tests
- `bun run test:watch` - Run tests in watch mode
- `bun run test:coverage` - Run tests with coverage
- `bun run clean` - Remove build artifacts

## Building Executables

```bash
# Build for Linux
bun run build-linux

# Build for Windows
bun run build-win

# Build for macOS Intel
bun run build-mac-x64

# Build for macOS Apple Silicon
bun run build-mac-arm64
```

Executables will be created in the `bin/` directory.

## Deployment

### Creating a Release

Releases are automatically built and published via GitHub Actions when you push a version tag.

#### For Stable Releases

1. Update the version in `package.json`:
   ```bash
   # Edit package.json and update the version field
   # Example: "version": "0.0.4"
   ```

2. Commit the version change:
   ```bash
   git add package.json
   git commit -m "Bump version to 0.0.4"
   ```

3. Create and push a version tag:
   ```bash
   git tag v0.0.4
   git push origin main
   git push origin v0.0.4
   ```

4. The GitHub Actions workflow will:
   - Validate the version matches the tag
   - Run tests
   - Build executables for all platforms (Linux, Windows, macOS x64, macOS ARM64)
   - Create a GitHub release with all binaries

#### For Nightly Releases

Nightly releases are automatically created when you push to any branch without a tag:

```bash
git push origin main
```

This will create/update a nightly release with binaries built from the latest commit.

### Release Artifacts

Each release includes:
- `lacky-linux-x64.tar.gz` - Linux x64 executable
- `lacky-windows-x64.zip` - Windows x64 executable
- `lacky-macos-x64.tar.gz` - macOS Intel executable
- `lacky-macos-arm64.tar.gz` - macOS Apple Silicon executable

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

