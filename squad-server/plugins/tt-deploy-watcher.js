import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import BasePlugin from './base-plugin.js';

const DEFAULT_REVISION_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../REVISION');

// Exits the process when the deployed commit SHA in the REVISION file changes, so the host restarts SquadJS on the
// new code. scripts/deploy-sftp.sh writes REVISION last, after all other files are uploaded.
export default class TTDeployWatcher extends BasePlugin {
  static get description() {
    return 'The <code>TTDeployWatcher</code> plugin restarts SquadJS when a new commit is deployed.';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      revisionPath: {
        required: false,
        description: 'Path to the file holding the deployed commit SHA. Defaults to REVISION in the SquadJS root.',
        default: ''
      },
      pollIntervalSeconds: {
        required: false,
        description: 'How often to check the revision file.',
        default: 30
      },
      exitCode: {
        required: false,
        description: 'Exit code to use. Hosts usually only auto-restart on a non-zero exit.',
        default: 1
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.revisionPath = this.options.revisionPath || DEFAULT_REVISION_PATH;
    this.bootRevision = null;
    this.interval = null;
    this.checkRevision = this.checkRevision.bind(this);
  }

  async mount() {
    this.bootRevision = await this.readRevision();
    this.verbose(1, `Running revision ${this.bootRevision ?? '(none)'} from ${this.revisionPath}.`);
    this.interval = setInterval(this.checkRevision, this.options.pollIntervalSeconds * 1000);
  }

  async unmount() {
    clearInterval(this.interval);
  }

  // Returns the trimmed file contents, or null if the file doesn't exist.
  async readRevision() {
    try {
      return (await fs.promises.readFile(this.revisionPath, 'utf8')).trim() || null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async checkRevision() {
    let revision;
    try {
      revision = await this.readRevision();
    } catch (error) {
      this.verbose(1, `Failed to read ${this.revisionPath}: ${error.message}`);
      return;
    }
    // A missing file is skipped rather than treated as a change: the deploy removes REVISION before renaming the new
    // one into place, since the SFTP server can't rename over an existing file.
    if (revision === null || revision === this.bootRevision) return;

    this.verbose(1, `Revision changed from ${this.bootRevision ?? '(none)'} to ${revision}. Exiting with code ${this.options.exitCode}.`);
    process.exit(this.options.exitCode);
  }
}
