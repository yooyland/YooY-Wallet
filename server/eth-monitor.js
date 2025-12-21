import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';

// ENV
const PORT = process.env.ETH_MONITOR_PORT || 3002;
const ALCHEMY_WS_URL = process.env.ALCHEMY_WS_URL || process.env.INFURA_WS_URL;
const YOY_ERC20 = process.env.YOY_ERC20 || process.env.EXPO_PUBLIC_YOY_ERC20_ADDRESS;

if (!ALCHEMY_WS_URL) {
  console.warn('[eth-monitor] Missing ALCHEMY_WS_URL/INFURA_WS_URL. Server will start but no subscriptions will be active.');
}

const app = express();
app.use(cors());
app.use(express.json());

// Subscriptions state
const subscribedAddresses = new Set(); // lowercase (native + any token)
const tokenFilters = new Map(); // tokenAddress(lowercase) -> handler
let provider = null;
let yoyFilter = null;
let latestBlock = 0;

const wss = new WebSocketServer({ noServer: true });
const sockets = new Set();
wss.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  sockets.forEach((s) => {
    try { s.send(data); } catch {}
  });
}

// Setup provider and ERC20 Transfer subscription
async function ensureProvider() {
  if (!ALCHEMY_WS_URL || provider) return;
  provider = new ethers.WebSocketProvider(ALCHEMY_WS_URL);
  provider._websocket?.on?.('close', () => {
    provider = null;
    setTimeout(ensureProvider, 2000);
  });
  await provider._waitUntilReady?.().catch(()=>{});
  provider.on('block', (bn) => {
    latestBlock = Number(bn);
    broadcast({ type: 'block', blockNumber: latestBlock });
  });
  const topicTransfer = ethers.id('Transfer(address,address,uint256)');
  const addTokenFilter = (tokenAddr) => {
    const lower = tokenAddr.toLowerCase();
    if (tokenFilters.has(lower)) return;
    const filter = { address: tokenAddr, topics: [topicTransfer] };
    const handler = (log) => {
      try {
        const iface = new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
        const parsed = iface.parseLog(log);
        const from = parsed.args.from.toLowerCase();
        const to = parsed.args.to.toLowerCase();
        const value = parsed.args.value; // BigInt
        if (subscribedAddresses.has(to)) {
          broadcast({
            type: 'erc20_transfer',
            token: lower,
            to,
            from,
            amount: value.toString(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber
          });
        }
      } catch (e) { console.error('parse log error', e); }
    };
    provider.on(filter, handler);
    tokenFilters.set(lower, handler);
  };
  if (YOY_ERC20) addTokenFilter(YOY_ERC20);

  // Native pending tx listener (ETH)
  provider.on('pending', async (txHash) => {
    try {
      const tx = await provider.getTransaction(txHash);
      if (!tx || !tx.to) return;
      const to = String(tx.to).toLowerCase();
      if (subscribedAddresses.has(to)) {
        broadcast({
          type: 'native_transfer',
          to,
          from: String(tx.from || '').toLowerCase(),
          amount: tx.value?.toString?.() || '0',
          txHash,
          blockNumber: null
        });
      }
    } catch {}
  });

  // expose to add filters later
  ensureProvider.addTokenFilter = addTokenFilter;
}
ensureProvider().catch(()=>{});

app.post('/subscribe', (req, res) => {
  try {
    const { address, token } = req.body || {};
    if (!address || typeof address !== 'string') return res.status(400).json({ ok:false, error:'address required' });
    subscribedAddresses.add(address.toLowerCase());
    if (token && typeof token === 'string' && ensureProvider.addTokenFilter) {
      ensureProvider.addTokenFilter(token);
    }
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false });
  }
});

app.post('/unsubscribe', (req, res) => {
  try {
    const { address } = req.body || {};
    if (!address || typeof address !== 'string') return res.status(400).json({ ok:false, error:'address required' });
    subscribedAddresses.delete(address.toLowerCase());
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false });
  }
});

const server = app.listen(PORT, () => console.log(`[eth-monitor] HTTP on http://localhost:${PORT}`));
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});


