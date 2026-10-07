import { spawn } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import https from 'https'
import os from 'os'
import path from 'path'
import BasePlugin from './base-plugin.js'

// The agent binary this plugin version expects. Must match a published `server-agent-v<version>` release
// (see .github/workflows/server-agent.yml) and server-agent/agent/Cargo.toml.
const AGENT_VERSION = '0.2.0'
const RELEASE_REPO = 'Tactrigsds/squad-layer-manager'

// Release asset name for the current platform. Matches the workflow's matrix.
function assetName() {
	if (process.platform === 'linux' && process.arch === 'x64') return 'slm-server-agent-x86_64-unknown-linux-musl'
	if (process.platform === 'win32' && process.arch === 'x64') return 'slm-server-agent-x86_64-pc-windows-msvc.exe'
	throw new Error(`no prebuilt slm-server-agent for ${process.platform}/${process.arch}; build it from source and set binaryPath`)
}

function httpGet(url) {
	return new Promise((resolve, reject) => {
		https.get(url, { headers: { 'User-Agent': 'slm-server-agent-plugin' } }, resolve).on('error', reject)
	})
}

function pipeToFile(res, dest) {
	return new Promise((resolve, reject) => {
		let settled = false
		const done = (err) => {
			if (settled) return
			settled = true
			if (err) reject(err)
			else resolve()
		}
		const file = createWriteStream(dest)
		res.pipe(file)
		file.on('finish', () => file.close((err) => done(err)))
		file.on('error', (err) => {
			try {
				unlinkSync(dest)
			} catch {}
			done(err)
		})
		res.on('error', done)
	})
}

export default class SLMServerAgent extends BasePlugin {
	static get description() {
		return "Streams this server's logs to Squad Layer Manager and proxies its RCON via the slm-server-agent "
			+ '(https://github.com/Tactrigsds/squad-layer-manager). The agent runs detached so it keeps working even if '
			+ 'SquadJS restarts or crashes. RCON is proxied only when all three rcon* options resolve (from these options '
			+ "or SquadJS's own rcon config); otherwise the agent runs logs-only."
	}

	static get defaultEnabled() {
		return false
	}

	static get optionsSpecification() {
		return {
			url: {
				required: true,
				description: 'SLM server-agent websocket url, e.g. wss://slm.example.com/server-agent',
			},
			slmServerId: {
				required: true,
				description: 'ID of this server as configured in Squad Layer Manager',
			},
			token: {
				required: true,
				description: 'The server-agent token for this server (SLM server settings -> Connections)',
			},
			insecure: {
				required: false,
				description: 'Skip TLS certificate verification (self-signed / IP-only certs)',
				default: false,
			},
			rconHost: {
				required: false,
				description: "RCON host to proxy. Defaults to SquadJS's rcon host, else 127.0.0.1. Set empty to disable the rcon proxy.",
				default: null,
			},
			rconPort: {
				required: false,
				description: "RCON port to proxy. Defaults to SquadJS's rcon port.",
				default: null,
			},
			rconPassword: {
				required: false,
				description: "RCON password (stays on this host, never sent to SLM). Defaults to SquadJS's rcon password.",
				default: null,
			},
			binaryPath: {
				required: false,
				description: 'Path to an existing slm-server-agent binary. If unset, the matching release is downloaded.',
				default: null,
			},
			binDir: {
				required: false,
				description: 'Directory to cache the downloaded agent binary in',
				default: path.join(os.tmpdir(), 'slm-server-agent'),
			},
			pidFile: {
				required: false,
				description: 'PID file used to detect an already-running agent. Defaults to a per-server path in the temp dir.',
				default: null,
			},
			logFile: {
				required: false,
				description: 'File the agent appends its own logs to (surfaced in SquadJS at verbose level 1)',
				default: null,
			},
			killOnExit: {
				required: false,
				description: 'Kill the agent when this plugin unmounts. Off by default so the agent survives a SquadJS restart/crash.',
				default: false,
			},
		}
	}

	constructor(server, options, connectors) {
		super(server, options, connectors)
		this.agentLogOffset = 0
		this.tailTimer = null
	}

	get pidFile() {
		return this.options.pidFile || path.join(os.tmpdir(), `slm-server-agent-${this.options.slmServerId}.pid`)
	}

	get logFilePath() {
		return this.options.logFile || path.join(os.tmpdir(), `slm-server-agent-${this.options.slmServerId}.log`)
	}

	// resolve the rcon proxy config from plugin options, falling back to SquadJS's own rcon config. Returns null
	// (proxy disabled, agent runs logs-only) if the host is explicitly blanked or no password can be found.
	resolveRcon() {
		const host = this.options.rconHost ?? this.server?.options?.rconHost ?? '127.0.0.1'
		if (host === '') return null
		const port = this.options.rconPort ?? this.server?.options?.rconPort
		const password = this.options.rconPassword ?? this.server?.options?.rconPassword
		if (port == null || password == null || password === '') return null
		return { host, port, password }
	}

	async mount() {
		this.cleanup = []

		// already running from a previous SquadJS run? leave it be -- that is the whole point of detaching.
		const existingPid = this.readPid()
		if (existingPid !== null && this.isAlive(existingPid)) {
			this.verbose(1, `slm-server-agent already running (pid ${existingPid})`)
			this.startTailingAgentLog()
			if (this.options.killOnExit) this.cleanup.push(() => this.killAgent(existingPid))
			return
		}

		const binary = this.options.binaryPath || (await this.ensureBinary())
		const logPath = path.join(this.server.options.logDir, 'SquadGame.log')

		const args = [
			'--url',
			this.options.url,
			'--server-id',
			String(this.options.slmServerId),
			'--token',
			String(this.options.token),
			'--file',
			logPath,
			'--log-file',
			this.logFilePath,
		]
		if (this.options.insecure) args.push('--insecure')
		const rcon = this.resolveRcon()
		if (rcon) {
			args.push('--rcon-host', String(rcon.host), '--rcon-port', String(rcon.port), '--rcon-password', String(rcon.password))
		} else {
			this.verbose(1, 'no rcon config resolved; agent will run logs-only')
		}

		// avoid logging the rcon password on the args line
		const safeArgs = args.map((a, i) => (args[i - 1] === '--rcon-password' ? '***' : a))
		this.verbose(1, `starting slm-server-agent: ${binary} ${safeArgs.join(' ')}`)

		// detached + unref + stdio ignore: the agent lives in its own process group and keeps running if
		// SquadJS exits or crashes. Its own logs go to logFilePath via --log-file.
		const child = spawn(binary, args, {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
		})
		child.on('error', (err) => this.verbose(1, `failed to start agent: ${err.message}`))
		child.unref()

		if (child.pid) this.writePid(child.pid)
		this.verbose(1, `slm-server-agent started (pid ${child.pid})`)

		this.startTailingAgentLog()
		if (this.options.killOnExit && child.pid) this.cleanup.push(() => this.killAgent(child.pid))
	}

	async unmount() {
		if (this.tailTimer) {
			clearInterval(this.tailTimer)
			this.tailTimer = null
		}
		for (const fn of this.cleanup ?? []) {
			try {
				await fn()
			} catch (err) {
				this.verbose(1, `cleanup error: ${err.message}`)
			}
		}
	}

	// -------- binary management --------

	async ensureBinary() {
		const asset = assetName()
		const dir = path.join(this.options.binDir, AGENT_VERSION)
		const dest = path.join(dir, asset)
		if (existsSync(dest)) return dest

		mkdirSync(dir, { recursive: true })
		const url = `https://github.com/${RELEASE_REPO}/releases/download/server-agent-v${AGENT_VERSION}/${asset}`
		this.verbose(1, `downloading slm-server-agent ${AGENT_VERSION} from ${url}`)
		const tmp = `${dest}.download`
		await this.download(url, tmp)
		if (process.platform !== 'win32') {
			const { chmodSync } = await import('fs')
			chmodSync(tmp, 0o755)
		}
		const { renameSync } = await import('fs')
		renameSync(tmp, dest)
		this.verbose(1, `slm-server-agent downloaded to ${dest}`)
		return dest
	}

	async download(url, dest, redirects = 0) {
		if (redirects > 5) throw new Error('too many redirects downloading agent')
		const res = await httpGet(url)
		// GitHub release downloads redirect to a CDN
		if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
			res.resume()
			return this.download(res.headers.location, dest, redirects + 1)
		}
		if (res.statusCode !== 200) {
			res.resume()
			throw new Error(`download failed: HTTP ${res.statusCode} for ${url}`)
		}
		await pipeToFile(res, dest)
		return dest
	}

	// -------- pid file --------

	readPid() {
		try {
			const pid = parseInt(readFileSync(this.pidFile, 'utf8').trim(), 10)
			return Number.isNaN(pid) ? null : pid
		} catch {
			return null
		}
	}

	writePid(pid) {
		try {
			writeFileSync(this.pidFile, String(pid))
		} catch (err) {
			this.verbose(1, `could not write pid file ${this.pidFile}: ${err.message}`)
		}
	}

	isAlive(pid) {
		try {
			process.kill(pid, 0)
			return true
		} catch {
			return false
		}
	}

	killAgent(pid) {
		this.verbose(1, `stopping slm-server-agent (pid ${pid})`)
		try {
			process.kill(pid, 'SIGTERM')
		} catch {}
		try {
			unlinkSync(this.pidFile)
		} catch {}
	}

	// -------- surface the agent's own logs in SquadJS --------

	// cross-platform tail: poll the agent's log file for new [LOG]/[ERROR] lines rather than shelling out
	// to `tail`, which does not exist on Windows
	startTailingAgentLog() {
		const file = this.logFilePath
		try {
			this.agentLogOffset = existsSync(file) ? statSync(file).size : 0
		} catch {
			this.agentLogOffset = 0
		}
		this.tailTimer = setInterval(() => this.pollAgentLog(file), 5000)
	}

	pollAgentLog(file) {
		let size
		try {
			size = statSync(file).size
		} catch {
			return
		}
		if (size <= this.agentLogOffset) {
			// rotated/truncated: start over from the top
			if (size < this.agentLogOffset) this.agentLogOffset = 0
			return
		}
		let chunk
		try {
			const fd = readFileSync(file)
			chunk = fd.subarray(this.agentLogOffset).toString('utf8')
		} catch {
			return
		}
		this.agentLogOffset = size
		for (const line of chunk.split('\n')) {
			const m = /^\[(LOG|ERROR)\]\s+\S+\s+(.*)$/.exec(line)
			if (m) this.verbose(1, `agent: ${m[2]}`)
		}
	}
}
