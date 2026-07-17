import "./settings.js"
import handler from './main.js'
import { participantsUpdate } from './commands/events.js'
import { Browsers, makeWASocket, makeCacheableSignalKeyStore, useMultiFileAuthState, fetchLatestBaileysVersion, jidDecode, DisconnectReason } from "@whiskeysockets/baileys";
import cfonts from 'cfonts';
import pino from "pino";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import boxen from 'boxen';
import { smsg } from "./lib/message.js";
import { startSubBot } from './lib/subs.js';
import { exec } from "child_process";
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function uPLoader() {
  console.clear()
  cfonts.say('MEGUMIN-BOT-MD', { font: 'block', align: 'center', colors: ['red'] })
  console.log(chalk.green("Railway detected - Forced Pairing Mode"))
  return process.env.LOGIN_METHOD || "2"
}

const queue = []; let running = false;
async function run() {
  if (running) return; running = true;
  while (queue.length) {
    const job = queue.shift();
    try { await job(); } catch (e) { console.error('Send error:', e); }
    await new Promise(r => setTimeout(r, 300));
  }
  running = false;
}
function enqueue(task) { queue.push(task); run(); }

export function patchSendMessage(clientt) {
  if (clientt._sendMessagePatched) return
  clientt._sendMessagePatched = true
  const original = clientt.sendMessage.bind(clientt)
  clientt.sendMessage = (jid, content, options = {}) => {
    return new Promise((resolve) => {
      enqueue(async () => {
        const res = await original(jid, content, options)
        resolve(res)
      })
    })
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(global.sessionName || "Sessions/Owner")
  const { version } = await fetchLatestBaileysVersion()
  const clientt = makeWASocket({
    version, logger: pino({ level: "silent" }), browser: Browsers.macOS('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) }
  })

  patchSendMessage(clientt)
  clientt.ev.on("creds.update", saveCreds)

  if (!clientt.authState.creds.registered && (process.env.LOGIN_METHOD === '2')) {
    const phone = (process.env.PHONE_NUMBER || "").replace(/[^0-9]/g, '')
    try {
        const pairing = await clientt.requestPairingCode(phone)
        console.log(chalk.bgMagenta.white.bold('\n CÓDIGO DE VINCULACIÓN: '), chalk.white.bold(pairing))
    } catch (e) { console.log(chalk.red('Error: Ingresa tu PHONE_NUMBER en variables')) }
  }

  clientt.ev.on("messages.upsert", async ({ messages }) => {
    let m = await smsg(clientt, messages[0])
    handler(clientt, m, messages)
  })
}

;(async () => {
  global.loadDatabase()
  await startBot()
})()
