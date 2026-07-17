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
import chalk from "chalk";
import fs from "fs";
import path from "path";
import boxen from 'boxen';
import { smsg } from "./lib/message.js";
import db from "./lib/system/database.js";
import { startSubBot } from './lib/subs.js';
import { exec } from "child_process";
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
  return process.env.LOGIN_METHOD || "2"
}

const BOT_TYPES = [{ name: 'SubBot', folder: './Sessions/Subs', starter: startSubBot }]
const queue = []
let running = false
const DELAY_NORMAL = 300
const DELAY_AFTER_RATELIMIT = 3000

global.conns = global.conns || []

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(global.sessionName || "Sessions/Owner")
  const { version } = await fetchLatestBaileysVersion()
  const logger = pino({ level: "silent" })

  const client = makeWASocket({
    version,
    logger,
    browser: Browsers.macOS('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    getMessage: async () => "",
    keepAliveIntervalMs: 45000,
    maxIdleTimeMs: 60000,
  })

  patchSendMessage(client)
  global.client = client
  client.ev.on("creds.update", saveCreds)

  if (!client.authState.creds.registered) {
    const phoneNumber = (process.env.PHONE_NUMBER || "").replace(/[^0-9]/g, '')
    if (phoneNumber) {
      try {
        const pairing = await client.requestPairingCode(phoneNumber)
        console.log(chalk.bgMagenta.white.bold('\n CÓDIGO DE VINCULACIÓN: '), chalk.white.bold(pairing))
      } catch (err) {
        console.log(chalk.red('❌ Error al generar código'))
      }
    }
  }

  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode || 0
      if (reason !== DisconnectReason.loggedOut) startBot()
    }
    if (connection === "open") console.log(boxen(chalk.bold(' ¡CONECTADO! '), { borderStyle: 'round', borderColor: 'green' }))
  })

  client.ev.on("messages.upsert", async ({ messages }) => {
    let m = await smsg(client, messages[0])
    handler(client, m, messages)
  })
}

function enqueue(task) { queue.push(task); run(); }
async function run() {
  if (running) return
  running = true
  while (queue.length) {
    const job = queue.shift()
    try { await job() } catch (e) { console.error('Send error:', e) }
    await new Promise(r => setTimeout(r, DELAY_NORMAL))
  }
  running = false
}

export function patchSendMessage(client) {
  if (client._sendMessagePatched) return
  client._sendMessagePatched = true
  const original = client.sendMessage.bind(client)
  client.sendMessage = (jid, content, options = {}) => {
    return new Promise((resolve) => {
      enqueue(async () => {
        const res = await original(jid, content, options)
        resolve(res)
      })
    })
  }
}

global.loadDatabase()
startBot()
                                                     
