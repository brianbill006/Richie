const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());

const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_LOCAL_APP_ID';
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
const IS_SECURE = process.env.NODE_ENV === 'production';

// --- ROUTES ---

app.get('/login', (req, res) => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('code_verifier', codeVerifier, { httpOnly: true, secure: IS_SECURE }); 
    res.cookie('oauth_state', state, { httpOnly: true, secure: IS_SECURE });
    const authUrl = `https://auth.deriv.com/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=trade%20account_manage&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const codeVerifier = req.cookies.code_verifier;
    const savedState = req.cookies.oauth_state;
    if (!code) return res.status(400).send('Error: No authorization code provided.');
    if (state !== savedState) return res.status(400).send('Error: State mismatch.');
    try {
        const response = await axios.post('https://auth.deriv.com/oauth2/token', new URLSearchParams({
            grant_type: 'authorization_code', client_id: CLIENT_ID, code: code,
            redirect_uri: REDIRECT_URI, code_verifier: codeVerifier
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        res.cookie('access_token', response.data.access_token, { httpOnly: true, secure: IS_SECURE });
        res.redirect('/');
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        res.status(500).send('Error exchanging token.');
    }
});

app.get('/api/me', (req, res) => {
    const token = req.cookies.access_token;
    if (!token) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, token: token });
});

app.get('/logout', (req, res) => {
    res.clearCookie('access_token');
    res.redirect('/');
});

app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Richie | Disciplined Sniper Bots</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #e2e8f0; display: flex; justify-content: center; padding: 20px; margin: 0; }
            .container { background: #1e293b; padding: 20px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); width: 100%; max-width: 800px; text-align: center; }
            h1 { color: #ff444f; margin-bottom: 5px; }
            .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
            .card { background: #334155; padding: 20px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #475569; text-align: left; }
            .card h3 { margin-top: 0; color: #f8fafc; border-bottom: 1px solid #475569; padding-bottom: 10px; }
            .control-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 15px; }
            .input-group { display: flex; flex-direction: column; text-align: left; }
            .input-group label { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
            input, select { padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 14px; outline: none; width: 100%; box-sizing: border-box;}
            .btn { padding: 12px 24px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; font-size: 16px; transition: 0.2s; }
            .btn-green { background: #10b981; color: white; width: 100%; }
            .btn-green:hover { background: #059669; }
            .btn-red { background: #ef4444; color: white; width: 100%; }
            .btn-red:hover { background: #dc2626; }
            .btn-gray { background: #64748b; color: white; text-decoration:none; display:inline-block; margin-top:10px; }
            #balance { font-size: 24px; font-weight: bold; color: #10b981; }
            .digit-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; margin-top: 15px; }
            .digit-box { background: #1e293b; padding: 8px 2px; border-radius: 4px; position: relative; overflow: hidden; text-align: center; border: 1px solid #475569; }
            .digit-box .fill { position: absolute; bottom: 0; left: 0; width: 100%; background: #334155; z-index: 1; transition: height 0.3s; }
            .digit-box .label { position: relative; z-index: 2; font-weight: bold; font-size: 14px; }
            .digit-box .pct { position: relative; z-index: 2; font-size: 10px; color: #94a3b8; }
            .highlight { border: 2px solid #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.3); }
            .danger { border: 2px solid #ef4444; }
            #sniper-log { background: #0f172a; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #38bdf8; height: 120px; overflow-y: auto; margin-top: 10px; border: 1px solid #334155; }
            .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; background: #475569; }
            .status-badge.running { background: #10b981; color: white; }
            .status-badge.stopped { background: #ef4444; color: white; }
            .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 15px; }
            .stat-box { background: #1e293b; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #475569; }
            .stat-box .val { font-size: 16px; font-weight: bold; color: #f8fafc; }
            .stat-box .lbl { font-size: 10px; color: #94a3b8; text-transform: uppercase; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Richie Disciplined Bots</h1>
            <div class="subtitle">Safe Recovery Mode & Sniper Analysis (No Martingale)</div>
            
            <div id="logged-out-view">
                <p>Please log in to access the trading bots.</p>
                <a href="/login" class="btn btn-green" style="text-decoration:none; display:block; text-align:center;">Login with Deriv</a>
            </div>

            <div id="logged-in-view" style="display: none;">
                <div class="card">
                    <h3>Account Balance</h3>
                    <p id="balance">Loading...</p>
                </div>

                <div class="card">
                    <h3>Discipline & Recovery Settings</h3>
                    <div class="control-group">
                        <div class="input-group">
                            <label>Base Stake (USD)</label>
                            <input type="number" id="stake-amount" value="0.35" step="0.01" min="0.35">
                        </div>
                        <div class="input-group">
                            <label>Recovery Mode</label>
                            <select id="recovery-mode">
                                <option value="none">None (Fixed Stake)</option>
                                <option value="fibonacci">Fibonacci (Safe)</option>
                                <option value="percent">50% Increase</option>
                                <option value="cooldown">Cool-off & Reset</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label>Max Consecutive Losses</label>
                            <input type="number" id="max-losses" value="3" min="1">
                        </div>
                        <div class="input-group">
                            <label>Take Profit (USD)</label>
                            <input type="number" id="take-profit" value="2.00" step="0.1">
                        </div>
                        <div class="input-group">
                            <label>Stop Loss (USD)</label>
                            <input type="number" id="stop-loss" value="5.00" step="0.1">
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3>Session Statistics</h3>
                    <div class="stats-grid">
                        <div class="stat-box"><div class="val" id="stat-trades">0</div><div class="lbl">Trades</div></div>
                        <div class="stat-box"><div class="val" id="stat-wins" style="color:#10b981;">0</div><div class="lbl">Wins</div></div>
                        <div class="stat-box"><div class="val" id="stat-losses" style="color:#ef4444;">0</div><div class="lbl">Losses</div></div>
                        <div class="stat-box"><div class="val" id="stat-profit" style="color:#38bdf8;">$0.00</div><div class="lbl">P/L</div></div>
                        <div class="stat-box"><div class="val" id="stat-next-stake" style="color:#fbbf24;">$0.35</div><div class="lbl">Next Stake</div></div>
                    </div>
                </div>

                <div class="card">
                    <h3>Bot Configuration</h3>
                    <div class="control-group">
                        <select id="bot-select">
                            <option value="over2">Sniper: Over 2</option>
                            <option value="under7">Sniper: Under 7</option>
                            <option value="over3">Sniper: Over 3</option>
                            <option value="under6">Sniper: Under 6</option>
                            <option value="over4">Sniper: Over 4</option>
                            <option value="even">Sniper: Even</option>
                            <option value="odd">Sniper: Odd</option>
                        </select>
                    </div>
                    <button id="start-bot-btn" class="btn btn-green">Start Disciplined Bot</button>
                    <button id="stop-bot-btn" class="btn btn-red" style="display: none;">Stop Bot</button>
                    
                    <div style="margin-top:10px;">Status: <span id="bot-status" class="status-badge stopped">Stopped</span></div>
                    <div id="sniper-log">Waiting for bot to start...</div>
                </div>

                <div class="card">
                    <h3>Live Digit Distribution (Last 100 Ticks)</h3>
                    <div class="digit-grid" id="digit-grid"></div>
                </div>
                
                <a href="/logout" class="btn btn-gray">Logout</a>
            </div>
        </div>

        <script>
            const APP_ID = '${CLIENT_ID}'; 
            let ws;
            let isBotRunning = false;
            let ticksBuffer = [];
            let lastTicks = [];
            let cooldownTicks = 0;
            let tradeInProgress = false;
            
            // Discipline Tracking
            let sessionStats = { wins: 0, losses: 0, profit: 0, consecutiveLosses: 0, totalTrades: 0 };
            
            // Safe Recovery Tracking (Non-Martingale)
            let baseStake = 0.35;
            let currentStake = 0.35;
            let fibIndex = 0;
            const fibSequence = [1, 1, 2, 3, 5, 8, 13, 21]; // Capped at 21x

            fetch('/api/me').then(res => res.json()).then(data => {
                if (data.loggedIn) {
                    document.getElementById('logged-out-view').style.display = 'none';
                    document.getElementById('logged-in-view').style.display = 'block';
                    connectWebSocket(data.token);
                }
            });

            function connectWebSocket(token) {
                ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=' + APP_ID);
                ws.onopen = () => { ws.send(JSON.stringify({ authorize: token })); };
                ws.onmessage = (msg) => { handleWebSocketMessage(JSON.parse(msg.data)); };
            }

            function handleWebSocketMessage(data) {
                if (data.msg_type === 'authorize') {
                    if (data.error) { console.error('Auth error:', data.error.message); return; }
                    ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                }
                if (data.msg_type === 'balance') {
                    document.getElementById('balance').innerText = data.balance.balance + ' ' + data.balance.currency;
                }
                if (data.msg_type === 'history') {
                    data.history.prices.forEach(price => processTick(price));
                }
                if (data.msg_type === 'tick') {
                    if (isBotRunning) processTick(data.tick.quote);
                }
                if (data.msg_type === 'buy') {
                    logSniper('✅ Trade placed! Contract ID: ' + data.buy.contract_id);
                    tradeInProgress = true;
                    ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: data.buy.contract_id, subscribe: 1 }));
                }
                if (data.msg_type === 'proposal_open_contract') {
                    const contract = data.proposal_open_contract;
                    if (contract.is_sold) {
                        tradeInProgress = false;
                        const profit = parseFloat(contract.profit);
                        updateSessionStats(profit);
                        checkDisciplineLimits();
                    }
                }
                if (data.error) {
                    logSniper('❌ Error: ' + data.error.message);
                    tradeInProgress = false;
                }
            }

            function updateSessionStats(profit) {
                sessionStats.totalTrades++;
                sessionStats.profit += profit;
                
                if (profit > 0) {
                    sessionStats.wins++;
                    sessionStats.consecutiveLosses = 0;
                    logSniper('🎉 WIN! Profit: +$' + profit.toFixed(2));
                } else {
                    sessionStats.losses++;
                    sessionStats.consecutiveLosses++;
                    logSniper('💀 LOSS. Amount: $' + profit.toFixed(2));
                }

                // Update UI
                document.getElementById('stat-trades').innerText = sessionStats.totalTrades;
                document.getElementById('stat-wins').innerText = sessionStats.wins;
                document.getElementById('stat-losses').innerText = sessionStats.losses;
                document.getElementById('stat-profit').innerText = '$' + sessionStats.profit.toFixed(2);
                document.getElementById('stat-profit').style.color = sessionStats.profit >= 0 ? '#10b981' : '#ef4444';
            }

            function calculateNextStake(profit) {
                const mode = document.getElementById('recovery-mode').value;
                baseStake = parseFloat(document.getElementById('stake-amount').value);

                if (profit > 0) {
                    // Reset on WIN
                    currentStake = baseStake;
                    fibIndex = 0;
                } else {
                    // Adjust on LOSS
                    if (mode === 'fibonacci') {
                        fibIndex = Math.min(fibIndex + 1, fibSequence.length - 1);
                        currentStake = baseStake * fibSequence[fibIndex];
                    } else if (mode === 'percent') {
                        currentStake = currentStake * 1.5; // 50% increase
                    } else if (mode === 'cooldown') {
                        currentStake = baseStake;
                        cooldownTicks = 30; // 30 tick cooldown
                        logSniper('⏳ Cool-off triggered. Waiting 30 ticks before next scan.');
                    } else {
                        currentStake = baseStake;
                    }
                }
                document.getElementById('stat-next-stake').innerText = '$' + currentStake.toFixed(2);
            }

            function checkDisciplineLimits() {
                const maxLosses = parseInt(document.getElementById('max-losses').value);
                const takeProfit = parseFloat(document.getElementById('take-profit').value);
                const stopLoss = parseFloat(document.getElementById('stop-loss').value);

                if (sessionStats.consecutiveLosses >= maxLosses) {
                    logSniper('🛑 DISCIPLINE TRIGGER: Max consecutive losses (' + maxLosses + ') reached. Bot stopped.');
                    stopBot();
                } else if (sessionStats.profit >= takeProfit) {
                    logSniper('🎯 DISCIPLINE TRIGGER: Take profit target ($' + takeProfit + ') reached. Bot stopped.');
                    stopBot();
                } else if (sessionStats.profit <= -stopLoss) {
                    logSniper('🛑 DISCIPLINE TRIGGER: Stop loss limit (-$' + stopLoss + ') hit. Bot stopped.');
                    stopBot();
                } else {
                    // Standard cooldown before next scan
                    if (cooldownTicks === 0) cooldownTicks = 5; 
                    logSniper('⏳ Cooldown active (' + cooldownTicks + ' ticks) before next entry scan...');
                }
            }

            function processTick(price) {
                const lastDigit = parseInt(price.toString().split('').pop());
                ticksBuffer.push(lastDigit);
                if (ticksBuffer.length > 100) ticksBuffer.shift();
                
                lastTicks.push(lastDigit);
                if (lastTicks.length > 10) lastTicks.shift();

                updateDigitUI();

                if (isBotRunning && !tradeInProgress) {
                    if (cooldownTicks > 0) {
                        cooldownTicks--;
                        if (cooldownTicks === 0) logSniper('Cooldown finished. Analyzing...');
                    } else {
                        runSniperStrategy();
                    }
                }
            }

            function updateDigitUI() {
                const counts = new Array(10).fill(0);
                ticksBuffer.forEach(d => counts[d]++);
                const total = ticksBuffer.length;
                let gridHtml = '';
                for (let i = 0; i < 10; i++) {
                    const pct = total > 0 ? ((counts[i] / total) * 100).toFixed(1) : '0.0';
                    let borderClass = '';
                    if (pct > 12) borderClass = 'highlight';
                    if (pct < 8) borderClass = 'danger';
                    gridHtml += '<div class="digit-box ' + borderClass + '">';
                    gridHtml += '<div class="fill" style="height: ' + pct + '%"></div>';
                    gridHtml += '<div class="label">' + i + '</div>';
                    gridHtml += '<div class="pct">' + pct + '%</div>';
                    gridHtml += '</div>';
                }
                document.getElementById('digit-grid').innerHTML = gridHtml;
            }

            function logSniper(msg) {
                const logDiv = document.getElementById('sniper-log');
                logDiv.innerHTML += '<br>[' + new Date().toLocaleTimeString() + '] ' + msg;
                logDiv.scrollTop = logDiv.scrollHeight;
            }

            function runSniperStrategy() {
                if (ticksBuffer.length < 50) return;

                const botType = document.getElementById('bot-select').value;
                const counts = new Array(10).fill(0);
                ticksBuffer.forEach(d => counts[d]++);
                const total = ticksBuffer.length;
                const pct = counts.map(c => (c / total) * 100);
                const lastDigit = lastTicks[lastTicks.length - 1];
                const last4 = lastTicks.slice(-4); 
                
                let trigger = false;
                let reason = '';

                // STRICTER SNIPER LOGIC (< 8.5% thresholds)
                switch(botType) {
                    case 'over2': 
                        if (pct[0] < 8.5 && pct[1] < 8.5 && pct[2] < 8.5 && lastDigit <= 2) { trigger = true; reason = 'Digits 0,1,2 heavily depressed (<8.5%). Last digit is ' + lastDigit; }
                        break;
                    case 'under7': 
                        if (pct[7] < 8.5 && pct[8] < 8.5 && pct[9] < 8.5 && lastDigit >= 7) { trigger = true; reason = 'Digits 7,8,9 heavily depressed (<8.5%). Last digit is ' + lastDigit; }
                        break;
                    case 'over3': 
                        if (pct[0] < 8.5 && pct[1] < 8.5 && pct[2] < 8.5 && pct[3] < 8.5 && last4.every(t => t <= 3)) { trigger = true; reason = 'Digits 0-3 heavily depressed. Last 4 ticks <= 3.'; }
                        break;
                    case 'under6': 
                        if (pct[6] < 8.5 && pct[7] < 8.5 && pct[8] < 8.5 && pct[9] < 8.5 && last4.every(t => t >= 6)) { trigger = true; reason = 'Digits 6-9 heavily depressed. Last 4 ticks >= 6.'; }
                        break;
                    case 'over4': 
                        if (pct[0] < 9.5 && pct[1] < 9.5 && pct[2] < 9.5 && pct[3] < 9.5 && pct[4] < 9.5 && last4.every(t => t < 4)) { trigger = true; reason = 'Digits 0-4 heavily depressed. Last 4 ticks < 4.'; }
                        break;
                    case 'even':
                        const evens = pct[0] + pct[2] + pct[4] + pct[6] + pct[8];
                        if (evens < 42 || last4.every(t => t % 2 !== 0)) { trigger = true; reason = 'Even % is ' + evens.toFixed(1) + '% OR 4 consecutive Odds detected.'; }
                        break;
                    case 'odd':
                        const odds = pct[1] + pct[3] + pct[5] + pct[7] + pct[9];
                        if (odds < 42 || last4.every(t => t % 2 === 0)) { trigger = true; reason = 'Odd % is ' + odds.toFixed(1) + '% OR 4 consecutive Evens detected.'; }
                        break;
                }

                if (trigger) {
                    logSniper('🔥 DISCIPLINED SNIPER TRIGGER: ' + reason);
                    executeTrade(botType);
                }
            }

            function executeTrade(botType) {
                let contractType = '';
                let barrier = '';

                switch(botType) {
                    case 'over2': contractType = 'DIGITOVER'; barrier = '2'; break;
                    case 'under7': contractType = 'DIGITUNDER'; barrier = '7'; break;
                    case 'over3': contractType = 'DIGITOVER'; barrier = '3'; break;
                    case 'under6': contractType = 'DIGITUNDER'; barrier = '6'; break;
                    case 'over4': contractType = 'DIGITOVER'; barrier = '4'; break;
                    case 'even': contractType = 'DIGITEVEN'; break;
                    case 'odd': contractType = 'DIGITODD'; break;
                }

                const tradeRequest = {
                    buy: 1, price: currentStake,
                    parameters: {
                        amount: currentStake, basis: "stake", contract_type: contractType,
                        currency: "USD", duration: 1, duration_unit: "t", symbol: "1HZ50V"
                    }
                };
                if (barrier) tradeRequest.parameters.barrier = barrier;
                logSniper('Placing trade: ' + contractType + ' | Stake: $' + currentStake.toFixed(2));
                ws.send(JSON.stringify(tradeRequest));
            }

            function startBot() {
                isBotRunning = true;
                ticksBuffer = [];
                lastTicks = [];
                cooldownTicks = 0;
                tradeInProgress = false;
                sessionStats = { wins: 0, losses: 0, profit: 0, consecutiveLosses: 0, totalTrades: 0 };
                updateSessionStats(0); 
                
                // Initialize Safe Recovery Stakes
                baseStake = parseFloat(document.getElementById('stake-amount').value);
                currentStake = baseStake;
                fibIndex = 0;
                document.getElementById('stat-next-stake').innerText = '$' + currentStake.toFixed(2);
                
                document.getElementById('bot-status').innerText = 'Running';
                document.getElementById('bot-status').className = 'status-badge running';
                document.getElementById('start-bot-btn').style.display = 'none';
                document.getElementById('stop-bot-btn').style.display = 'inline-block';
                document.getElementById('sniper-log').innerHTML = 'Starting Disciplined Sniper Engine...';
                
                ws.send(JSON.stringify({ ticks_history: "1HZ50V", count: 100, end: "latest", style: "ticks" }));
                ws.send(JSON.stringify({ ticks: "1HZ50V", subscribe: 1 }));
            }

            function stopBot() {
                isBotRunning = false;
                document.getElementById('bot-status').innerText = 'Stopped';
                document.getElementById('bot-status').className = 'status-badge stopped';
                document.getElementById('start-bot-btn').style.display = 'inline-block';
                document.getElementById('stop-bot-btn').style.display = 'none';
                ws.send(JSON.stringify({ forget_all: "ticks" }));
            }

            // Hook up the profit calculation to the recovery mode logic
            const originalUpdateSessionStats = updateSessionStats;
            updateSessionStats = function(profit) {
                originalUpdateSessionStats(profit);
                if (sessionStats.totalTrades > 0) {
                    calculateNextStake(profit);
                }
            };

            document.getElementById('start-bot-btn')?.addEventListener('click', startBot);
            document.getElementById('stop-bot-btn')?.addEventListener('click', stopBot);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Richie is running on port ${PORT}`));
