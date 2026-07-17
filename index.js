import "./settings.js"
import handler from './main.js'
import { participantsUpdate } from './commands/events.js'
import {
  Browsers,
  makeWASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  jidDecode,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import cfonts from 'cfonts';
import pino from "pino";
import crypto from 'crypto';
import chalk from "chalk";
import fs from "fs";
import path from "path";
import boxen from 'boxen';
import os from "os";
import qrcode from "qrcode-terminal";
import parsePhoneNumber from "awesome-phonenumber";
import { smsg } from "./lib/message.js";
import db from "./lib/system/database.js";
import { startSubBot } from './lib/subs.js';
import { exec, execSync } from "child_process";
import moment from 'moment-timezone';
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const log = {
  info: (msg) => console.log(chalk.bgBlue.white.bold(`INFO`), chalk.white(msg)),
  success: (msg) => console.log(chalk.bgGreen.white.bold(`SUCCESS`), chalk.greenBright(msg)),
  warn: (msg) => console.log(chalk.bgYellowBright.blueBright.bold(`WARNING`), chalk.yellow(msg)),
  warning: (msg) => console.log(chalk.bgYellowBright.red.bold(`WARNING`), chalk.yellow(msg)),
  error: (msg) => console.log(chalk.bgRed.white.bold(`ERROR`), chalk.redBright(msg)),
}

export async function uPLoader() {
  console.clear()
  cfonts.say('MEGUMIN-BOT-MD', { font: 'block', align: 'center', colors: ['red'] })
  cfonts.say('powered by David-Chian', { font: 'console', align: 'center', gradient: ['blue', 'cyan'] })
  console.log(chalk.green("Railway detected - Pairing Mode"))
  return process.env.LOGIN_METHOD || "2"
}

const DIGITS = (s = "") => String(s).replace(/\D/g, "")
function normalizePhoneForPairing(input) {
  let s = DIGITS(input)
  if (!s) return ""
  if (s.startsWith("0")) s = s.replace(/^0+/, "")
  if (s.length === 10 && s.startsWith("3")) s = "57" + s
  if (s.startsWith("52") && !s.startsWith("521") && s.length >= 12) s = "521" + s.slice(2)
  if (s.startsWith("54") && !s.startsWith("549") && s.length >= 11) s = "549" + s.slice(2)
  return s
}

const BOT_TYPES = [{ name: 'SubBot', folder: './Sessions/Subs', starter: startSubBot }]
const queue = []
let running = false
const DELAY_NORMAL = 300
const DELAY_AFTER_RATELIMIT = 3000
global.conns = global.conns || []
const reconnecting = new Set()

async function loadBots() {
  for (const { name, folder, starter } of BOT_TYPES) {
    if (!fs.existsSync(folder)) continue
    const botIds = fs.readdirSync(folder)
    for (const userId of botIds) {
      const sessionPath = path.join(folder, userId)
      const credsPath = path.join(sessionPath, 'creds.json')
      if (!fs.existsSync(credsPath)) continue
      if (global.conns.some((conn) => conn.userId === userId)) continue
      if (reconnecting.has(userId)) continue
      try {
        reconnecting.add(userId)
        await starter(null, null, 'Auto reconexión', false, userId, sessionPath)
      } catch (e) { reconnecting.delete(userId) }
      await new Promise((res) => setTimeout(res, 2500))
    }
  }
  setTimeout(loadBots, 60 * 1000)
}

(async () => { await loadBots() })()

let LOGIN_METHOD = null

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(global.sessionName)
  const { version } = await fetchLatestBaileysVersion()
  const logger = pino({ level: "silent" })
  const clientt = makeWASocket({
    version, logger, browser: Browsers.macOS('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false, generateHighQualityLinkPreview: true,
    syncFullHistory: false, getMessage: async () => "",
    keepAliveIntervalMs: 45000, maxIdleTimeMs: 60000,
  })

  patchSendMessage(clientt)
  global.client = clientt
  clientt.isInit = false
  clientt.ev.on("creds.update", saveCreds)

  if (!clientt.authState.creds.registered) {
    if (LOGIN_METHOD === '2') {
      const phoneNumber = normalizePhoneForPairing(process.env.PHONE_NUMBER || "")
      try {
        const pairing = await clientt.requestPairingCode(phoneNumber)
        console.log(chalk.bgMagenta.white.bold('\n CÓDIGO DE VINCULACIÓN ') + '\n\n' + chalk.white.bold(pairing) + '\n')
      } catch (err) { process.exit(1) }
    }
  }

  clientt.sendText = (jid, text, quoted = "", options) => clientt.sendMessage(jid, { text: text, ...options }, { quoted })

  clientt.ev.on("connection.update", async (update) => {
    const { qr, connection, lastDisconnect, isNewLogin } = update
    if (qr) { qrcode.generate(qr, { small: true }) }
    if (connection === "close") startBot()
    if (connection === "open") console.log(chalk.green("¡CONECTADO!"))
  })

  clientt.ev.on("messages.upsert", async ({ messages }) => {
    let m = messages[0]
    if (!m.message) return
    m = await smsg(clientt, m)
    handler(clientt, m, messages)
  })
}

// ... (Baaki functions: patchSendMessage, enqueue, run, etc. yahan rakhein)

;(async () => {
  global.loadDatabase()
  if (!fs.existsSync('./Sessions/Owner/creds.json')) {
    LOGIN_METHOD = process.env.LOGIN_METHOD || "2"
  }
  await startBot()
})()
  
