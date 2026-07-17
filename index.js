import { 
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";

const phoneNumber = "92XXXXXXXXXX"; // apna number country code ke sath

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState?.creds?.registered) {
    setTimeout(async () => {
      const code = await sock.requestPairingCode(phoneNumber);
      console.log("Pairing Code:", code);
    }, 3000);
  }

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("Bot Connected ✅");
    }

    if (connection === "close") {
      console.log("Restarting...");
      startBot();
    }
  });
}

startBot();
