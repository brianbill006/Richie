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
        <title>Richie | Deriv Workspace</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --deriv-red: #ff444f;
                --deriv-red-hover: #e03e48;
                --deriv-dark-bg: #151a2d;
                --deriv-darker-bg: #0e0e0e;
                --deriv-card-bg: #1e2336;
                --deriv-border: #2a3045;
                --deriv-text: #ffffff;
                --deriv-text-muted: #8890a6;
                --deriv-green: #00c0a6;
                --deriv-blue: #4a90e2;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; background-color: var(--deriv-darker-bg); color: var(--deriv-text); display: flex; height: 100vh; overflow: hidden; }
            
            /* Sidebar */
            .sidebar { width: 250px; background-color: var(--deriv-dark-bg); border-right: 1px solid var(--deriv-border); display: flex; flex-direction: column; padding: 20px 0; transition: 0.3s; overflow-y: auto; }
            .logo { display: flex; align-items: center; justify-content: center; margin-bottom: 30px; font-size: 24px; font-weight: 700; color: var(--deriv-red); letter-spacing: 1px; flex-shrink: 0;}
            .nav-item { padding: 15px 25px; cursor: pointer; display: flex; align-items: center; gap: 15px; color: var(--deriv-text-muted); transition: 0.2s; font-weight: 500; white-space: nowrap; }
            .nav-item:hover, .nav-item.active { background-color: var(--deriv-card-bg); color: var(--deriv-text); border-left: 4px solid var(--deriv-red); }
            .nav-item.active { border-left-color: var(--deriv-red); }
            
            /* Main Content */
            .main-content { flex: 1; padding: 30px; overflow-y: auto; background-color: var(--deriv-darker-bg); }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
            .header h1 { font-size: 24px; font-weight: 600; }
            .user-info { display: flex; align-items: center; gap: 15px; background: var(--deriv-card-bg); padding: 10px 20px; border-radius: 30px; border: 1px solid var(--deriv-border); }
            .balance-display { font-size: 20px; font-weight: 700; color: var(--deriv-green); }

            /* Cards & Grid */
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .card { background: var(--deriv-card-bg); padding: 20px; border-radius: 12px; border: 1px solid var(--deriv-border); }
            .card h3 { font-size: 16px; margin-bottom: 15px; color: var(--deriv-text-muted); text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
            
            /* Form Elements */
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; font-size: 12px; color: var(--deriv-text-muted); margin-bottom: 6px; }
            input, select { width: 100%; padding: 12px; background: var(--deriv-dark-bg); border: 1px solid var(--deriv-border); border-radius: 6px; color: var(--deriv-text); font-size: 14px; outline: none; }
            input:focus, select:focus { border-color: var(--deriv-red); }
            .btn { width: 100%; padding: 12px; border: none; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; transition: 0.2s; }
            .btn-primary { background: var(--deriv-red); color: white; }
            .btn-primary:hover { background: var(--deriv-red-hover); }
            .btn-secondary { background: var(--deriv-border); color: white; }
            .btn-secondary:hover { background: #3b4259; }
            .btn-green { background: var(--deriv-green); color: white; }

            /* Digit Grid (Manual Trader) */
            .digit-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; margin-top: 15px; }
            .digit-box { background: var(--deriv-dark-bg); padding: 10px 2px; border-radius: 6px; position: relative; overflow: hidden; text-align: center; border: 1px solid var(--deriv-border); }
            .digit-box .fill { position: absolute; bottom: 0; left: 0; width: 100%; background: var(--deriv-border); z-index: 1; transition: height 0.3s; }
            .digit-box .label { position: relative; z-index: 2; font-weight: 700; font-size: 14px; }
            .digit-box .pct { position: relative; z-index: 2; font-size: 10px; color: var(--deriv-text-muted); }
            .digit-box.highlight { border: 2px solid var(--deriv-green); }
            .digit-box.danger { border: 2px solid var(--deriv-red); }

            /* Free Bots Grid */
            .bot-card { background: var(--deriv-card-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--deriv-border); display: flex; flex-direction: column; justify-content: space-between; }
            .bot-card h4 { margin-bottom: 5px; font-size: 15px; }
            .bot-card p { font-size: 12px; color: var(--deriv-text-muted); margin-bottom: 15px; }
            
            /* Logs */
            #sniper-log { background: var(--deriv-darker-bg); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; color: var(--deriv-blue); height: 150px; overflow-y: auto; border: 1px solid var(--deriv-border); margin-top: 15px; }

            /* File Uploader */
            .upload-area { border: 2px dashed var(--deriv-border); padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; cursor: pointer; transition: 0.2s; }
            .upload-area:hover { border-color: var(--deriv-red); background: rgba(255, 68, 79, 0.05); }
            .upload-area input[type="file"] { display: none; }

            /* Toggle Visibility */
            .page { display: none; }
            .page.active { display: block; }
            
            /* Login Screen */
            #login-screen { display: flex; justify-content: center; align-items: center; height: 100vh; width: 100vw; flex-direction: column; }
            #login-screen .logo { font-size: 48px; margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <!-- LOGIN SCREEN -->
        <div id="login-screen">
            <div class="logo">Richie</div>
            <p style="color: var(--deriv-text-muted); margin-bottom: 20px;">Deriv Trading Workspace</p>
            <a href="/login" class="btn btn-primary" style="text-decoration:none; display:inline-block; width: auto; padding: 12px 40px;">Login with Deriv</a>
        </div>

        <!-- DASHBOARD APP -->
        <div id="app" style="display: none; width: 100%; height: 100%;">
            <!-- Sidebar -->
            <div class="sidebar">
                <div class="logo">Richie</div>
                <div class="nav-item active" data-target="dashboard">Dashboard</div>
                <div class="nav-item" data-target="bot-builder">Bot Builder</div>
                <div class="nav-item" data-target="free-bots">Free Bots</div>
                <div class="nav-item" data-target="manual-trader">Manual Trader</div>
                <div class="nav-item" data-target="touch-no-touch">Touch / No Touch</div>
                <div class="nav-item" data-target="accumulators">Accumulators</div>
                <div class="nav-item" style="margin-top: auto; color: var(--deriv-red);" onclick="window.location.href='/logout'">Logout</div>
            </div>

            <!-- Main Content -->
            <div class="main-content">
                <!-- Header -->
                <div class="header">
                    <h1 id="page-title">Dashboard</h1>
                    <div class="user-info">
                        <span>Balance:</span>
                        <span class="balance-display" id="balance">$0.00</span>
                    </div>
                </div>

                <!-- PAGE: DASHBOARD -->
                <div id="page-dashboard" class="page active">
                    <div class="grid">
                        <div class="card">
                            <h3>Session Statistics</h3>
                            <div style="display: flex; gap: 20px; text-align: center;">
                                <div><div style="font-size: 24px; font-weight: 700;" id="stat-trades">0</div><div style="font-size: 12px; color: var(--deriv-text-muted);">Trades</div></div>
                                <div><div style="font-size: 24px; font-weight: 700; color: var(--deriv-green);" id="stat-wins">0</div><div style="font-size: 12px; color: var(--deriv-text-muted);">Wins</div></div>
                                <div><div style="font-size: 24px; font-weight: 700; color: var(--deriv-red);" id="stat-losses">0</div><div style="font-size: 12px; color: var(--deriv-text-muted);">Losses</div></div>
                                <div><div style="font-size: 24px; font-weight: 700; color: var(--deriv-blue);" id="stat-profit">$0.00</div><div style="font-size: 12px; color: var(--deriv-text-muted);">P/L</div></div>
                            </div>
                        </div>
                        <div class="card">
                            <h3>Quick Actions</h3>
                            <button class="btn btn-primary" onclick="showPage('bot-builder')">Configure Bot</button>
                            <button class="btn btn-secondary" style="margin-top: 10px;" onclick="showPage('manual-trader')">Manual Trading</button>
                        </div>
                    </div>
                </div>

                <!-- PAGE: BOT BUILDER -->
                <div id="page-bot-builder" class="page">
                    <!-- DBot XML Importer -->
                    <div class="card" style="max-width: 600px; margin-bottom: 20px;">
                        <h3>Import Deriv DBot XML</h3>
                        <label for="xml-upload" class="upload-area">
                            <div style="font-size: 30px; color: var(--deriv-border);">📂</div>
                            <div style="margin-top: 10px; font-weight: 500;">Click to upload a .xml DBot file</div>
                            <div style="font-size: 12px; color: var(--deriv-text-muted); margin-top: 5px;">Extracts market, stake, and trade type to configure the Sniper Bot.</div>
                            <input type="file" id="xml-upload" accept=".xml">
                        </label>
                        <div id="upload-status" style="font-size: 12px; color: var(--deriv-green); text-align: center; display: none;">File loaded successfully!</div>
                    </div>

                    <div class="card" style="max-width: 600px;">
                        <h3>1. Bot Configuration</h3>
                        <div class="form-group">
                            <label>Market</label>
                            <select id="market-select">
                                <!-- Options will be populated by JavaScript -->
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Bot Strategy (Sniper Engine)</label>
                            <select id="bot-select">
                                <option value="over2_under7">Sniper: Over 2 & Under 7 Combo</option>
                                <option value="atlas_over4">Atlas Sniper: Over 4 (Sharp)</option>
                                <option value="over3">Sniper: Over 3</option>
                                <option value="over5">Sniper: Over 5</option>
                                <option value="under5">Sniper: Under 5</option>
                                <option value="under6">Sniper: Under 6</option>
                                <option value="under7">Sniper: Under 7</option>
                                <option value="under8">Sniper: Under 8</option>
                                <option value="even">Sniper: Even (High Accuracy)</option>
                                <option value="odd">Sniper: Odd (High Accuracy)</option>
                                <option value="over2">Sniper: Over 2 (Standard)</option>
                                <option value="over4">Sniper: Over 4 (Standard)</option>
                                <option value="match_5">Sniper: Matches 5</option>
                                <option value="differ_5">Sniper: Differs 5</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Base Stake (USD)</label>
                            <input type="number" id="stake-amount" value="0.35" step="0.01" min="0.35">
                        </div>
                        <div class="form-group">
                            <label>Recovery Mode (No Martingale)</label>
                            <select id="recovery-mode">
                                <option value="none">None (Fixed Stake)</option>
                                <option value="fibonacci">Fibonacci (Safe)</option>
                                <option value="percent">50% Increase</option>
                                <option value="cooldown">Cool-off & Reset</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Max Consecutive Losses</label>
                            <input type="number" id="max-losses" value="3" min="1">
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button id="start-bot-btn" class="btn btn-primary">Start Bot</button>
                            <button id="stop-bot-btn" class="btn btn-secondary" style="display: none;">Stop Bot</button>
                        </div>
                    </div>
                    <div class="card" style="margin-top: 20px;">
                        <h3>Live Analysis Log</h3>
                        <div id="sniper-log">Waiting for bot to start...</div>
                    </div>
                </div>

                <!-- PAGE: FREE BOTS -->
                <div id="page-free-bots" class="page">
                    <div class="grid">
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Over 2 & Under 7</h4>
                                <p>High win rate combo. Waits for depressed digits on either side of the spectrum.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('over2_under7')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Atlas Sniper Over 4</h4>
                                <p>Waits for 0-4 < 10%, max 2 high digits, green bar away from 4, and last 3 ticks < 4.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('atlas_over4')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Over 3</h4>
                                <p>Waits for 0-3 to be heavily depressed (<8.5%) and last 3 ticks <= 3.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('over3')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Over 5</h4>
                                <p>Waits for 0-4 to be heavily depressed (<9.0%) and last 3 ticks <= 4.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('over5')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Under 5</h4>
                                <p>Waits for 5-9 to be heavily depressed (<9.0%) and last 3 ticks >= 5.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('under5')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Under 6</h4>
                                <p>Waits for 6-9 to be heavily depressed (<8.5%) and last 3 ticks >= 6.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('under6')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Under 7</h4>
                                <p>Waits for 7-9 to be heavily depressed (<8.5%) and last 3 ticks >= 7.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('under7')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Under 8</h4>
                                <p>Waits for 8-9 to be heavily depressed (<8.5%) and last 3 ticks >= 8.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('under8')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Even (High Accuracy)</h4>
                                <p>Enters when Even percentage drops below 42% or 4 consecutive Odds.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('even')">Load Bot</button>
                        </div>
                        <div class="bot-card">
                            <div>
                                <h4>Sniper Odd (High Accuracy)</h4>
                                <p>Enters when Odd percentage drops below 42% or 4 consecutive Evens.</p>
                            </div>
                            <button class="btn btn-primary" onclick="loadFreeBot('odd')">Load Bot</button>
                        </div>
                    </div>
                </div>

                <!-- PAGE: MANUAL TRADER -->
                <div id="page-manual-trader" class="page">
                    <div class="card">
                        <h3>Live Digit Distribution (Last 100 Ticks)</h3>
                        <div class="digit-grid" id="digit-grid"></div>
                    </div>
                    <div class="card" style="margin-top: 20px; max-width: 400px;">
                        <h3>Manual Entry (Digits)</h3>
                        <div class="form-group">
                            <label>Stake (USD)</label>
                            <input type="number" id="manual-stake" value="1.00" step="0.01">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button class="btn btn-green" id="btn-over">Over 4</button>
                            <button class="btn btn-primary" id="btn-under">Under 5</button>
                        </div>
                    </div>
                </div>

                <!-- PAGE: TOUCH / NO TOUCH -->
                <div id="page-touch-no-touch" class="page">
                    <div class="card" style="max-width: 400px;">
                        <h3>Touch / No Touch Trade</h3>
                        <div class="form-group">
                            <label>Stake (USD)</label>
                            <input type="number" id="tt-stake" value="1.00" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>Barrier Price</label>
                            <input type="number" id="tt-barrier" value="0.00" step="0.01" placeholder="Enter exact price">
                        </div>
                        <div class="form-group">
                            <label>Duration (Ticks)</label>
                            <input type="number" id="tt-duration" value="5" min="1">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button class="btn btn-green" id="btn-touch">Touch</button>
                            <button class="btn btn-primary" id="btn-notouch">No Touch</button>
                        </div>
                    </div>
                </div>

                <!-- PAGE: ACCUMULATORS -->
                <div id="page-accumulators" class="page">
                    <div class="card" style="max-width: 400px;">
                        <h3>Accumulators</h3>
                        <div class="form-group">
                            <label>Stake (USD)</label>
                            <input type="number" id="accu-stake" value="1.00" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>Growth Rate (%)</label>
                            <input type="number" id="accu-growth" value="1" step="0.1" min="0.1">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button class="btn btn-green" id="btn-accu-up">Accumulator Up</button>
                            <button class="btn btn-primary" id="btn-accu-down">Accumulator Down</button>
                        </div>
                        <p style="font-size: 11px; color: var(--deriv-text-muted); margin-top: 15px;">Note: Accumulators run continuously. Monitor your trade in the Deriv platform and close manually when satisfied.</p>
                    </div>
                </div>

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
            let selectedSymbol = '1HZ50V'; 
            
            let sessionStats = { wins: 0, losses: 0, profit: 0, consecutiveLosses: 0, totalTrades: 0 };
            let baseStake = 0.35;
            let currentStake = 0.35;
            let fibIndex = 0;
            const fibSequence = [1, 1, 2, 3, 5, 8, 13, 21];

            // Market Options
            const markets = [
                { code: '1HZ10V', name: 'Volatility 10 (1s) Index' },
                { code: '1HZ25V', name: 'Volatility 25 (1s) Index' },
                { code: '1HZ50V', name: 'Volatility 50 (1s) Index' },
                { code: '1HZ75V', name: 'Volatility 75 (1s) Index' },
                { code: '1HZ100V', name: 'Volatility 100 (1s) Index' },
                { code: 'R_10', name: 'Volatility 10 Index' },
                { code: 'R_25', name: 'Volatility 25 Index' },
                { code: 'R_50', name: 'Volatility 50 Index' },
                { code: 'R_75', name: 'Volatility 75 Index' },
                { code: 'R_100', name: 'Volatility 100 Index' },
                { code: 'BOOM300N', name: 'Boom 300 Index' },
                { code: 'BOOM500', name: 'Boom 500 Index' },
                { code: 'BOOM1000', name: 'Boom 1000 Index' },
                { code: 'CRASH300N', name: 'Crash 300 Index' },
                { code: 'CRASH500', name: 'Crash 500 Index' },
                { code: 'CRASH1000', name: 'Crash 1000 Index' },
                { code: 'JD10', name: 'Jump 10 Index' },
                { code: 'JD25', name: 'Jump 25 Index' },
                { code: 'JD50', name: 'Jump 50 Index' },
                { code: 'JD75', name: 'Jump 75 Index' },
                { code: 'JD100', name: 'Jump 100 Index' },
                { code: 'STPRNG', name: 'Step Index' },
                { code: 'RB100', name: 'Range Break 100 Index' },
                { code: 'RB200', name: 'Range Break 200 Index' }
            ];

            function populateMarkets() {
                const select = document.getElementById('market-select');
                select.innerHTML = '';
                markets.forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.code;
                    option.textContent = m.name;
                    if (m.code === selectedSymbol) option.selected = true;
                    select.appendChild(option);
                });
            }
            populateMarkets();

            function showPage(pageId) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.getElementById('page-' + pageId).classList.add('active');
                document.querySelector('.nav-item[data-target="' + pageId + '"]').classList.add('active');
                document.getElementById('page-title').innerText = pageId.replace(/-/g, ' ').toUpperCase();
            }

            document.querySelectorAll('.nav-item[data-target]').forEach(item => {
                item.addEventListener('click', () => showPage(item.getAttribute('data-target')));
            });

            fetch('/api/me').then(res => res.json()).then(data => {
                if (data.loggedIn) {
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('app').style.display = 'flex';
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
                    processTick(data.tick.quote);
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
                if (data.error) { logSniper('❌ Error: ' + data.error.message); tradeInProgress = false; }
            }

            function updateSessionStats(profit) {
                if (profit === 0 && sessionStats.totalTrades === 0) {
                    document.getElementById('stat-trades').innerText = 0;
                    document.getElementById('stat-wins').innerText = 0;
                    document.getElementById('stat-losses').innerText = 0;
                    document.getElementById('stat-profit').innerText = '$0.00';
                    return;
                }
                sessionStats.totalTrades++;
                sessionStats.profit += profit;
                if (profit > 0) { sessionStats.wins++; sessionStats.consecutiveLosses = 0; logSniper('🎉 WIN! +$' + profit.toFixed(2)); }
                else { sessionStats.losses++; sessionStats.consecutiveLosses++; logSniper('💀 LOSS. $' + profit.toFixed(2)); }
                
                document.getElementById('stat-trades').innerText = sessionStats.totalTrades;
                document.getElementById('stat-wins').innerText = sessionStats.wins;
                document.getElementById('stat-losses').innerText = sessionStats.losses;
                document.getElementById('stat-profit').innerText = '$' + sessionStats.profit.toFixed(2);
                document.getElementById('stat-profit').style.color = sessionStats.profit >= 0 ? 'var(--deriv-green)' : 'var(--deriv-red)';
            }

            function checkDisciplineLimits() {
                const maxLosses = parseInt(document.getElementById('max-losses').value);
                if (sessionStats.consecutiveLosses >= maxLosses) { logSniper('🛑 Max consecutive losses reached. Stopped.'); stopBot(); }
                else { cooldownTicks = 5; logSniper('⏳ Cooldown (5 ticks)...'); }
            }

            function processTick(price) {
                const lastDigit = parseInt(price.toString().split('').pop());
                ticksBuffer.push(lastDigit);
                if (ticksBuffer.length > 100) ticksBuffer.shift();
                lastTicks.push(lastDigit);
                if (lastTicks.length > 10) lastTicks.shift();

                updateDigitUI();

                if (isBotRunning && !tradeInProgress) {
                    if (cooldownTicks > 0) { cooldownTicks--; }
                    else { runSniperStrategy(); }
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
                const last3 = lastTicks.slice(-3); 
                const last4 = lastTicks.slice(-4); 
                
                let trigger = false; let reason = '';
                let dynamicContract = '';

                switch(botType) {
                    case 'over2_under7':
                        const lowOver2 = pct[0] < 8.5 && pct[1] < 8.5 && pct[2] < 8.5 && last3.every(t => t <= 2);
                        const highUnder7 = pct[7] < 8.5 && pct[8] < 8.5 && pct[9] < 8.5 && last3.every(t => t >= 7);
                        if (lowOver2) { trigger = true; dynamicContract = 'DIGITOVER'; reason = '0,1,2 depressed (<8.5%). Last 3 ticks <= 2.'; }
                        else if (highUnder7) { trigger = true; dynamicContract = 'DIGITUNDER'; reason = '7,8,9 depressed (<8.5%). Last 3 ticks >= 7.'; }
                        break;
                    case 'atlas_over4':
                        const lowDigitsUnder10 = [0,1,2,3,4].every(d => pct[d] < 10);
                        const highCount = pct.filter(p => p > 10).length;
                        const maxPct = Math.max(...pct);
                        const maxDigit = pct.indexOf(maxPct);
                        const greenBarAway = maxDigit >= 6;
                        const last3Under4 = last3.every(t => t < 4);
                        if (lowDigitsUnder10 && highCount <= 2 && greenBarAway && last3Under4) { trigger = true; reason = 'ATLAS TRIGGER: 0-4 < 10%, Max 2 high digits, Green Bar at ' + maxDigit + ', Last 3 ticks < 4.'; }
                        break;
                    case 'over3': if (pct[0] < 8.5 && pct[1] < 8.5 && pct[2] < 8.5 && pct[3] < 8.5 && last3.every(t => t <= 3)) { trigger = true; reason = '0-3 depressed (<8.5%). Last 3 ticks <= 3.'; } break;
                    case 'over5': if (pct[0] < 9.0 && pct[1] < 9.0 && pct[2] < 9.0 && pct[3] < 9.0 && pct[4] < 9.0 && last3.every(t => t <= 4)) { trigger = true; reason = '0-4 depressed (<9.0%). Last 3 ticks <= 4.'; } break;
                    case 'under5': if (pct[5] < 9.0 && pct[6] < 9.0 && pct[7] < 9.0 && pct[8] < 9.0 && pct[9] < 9.0 && last3.every(t => t >= 5)) { trigger = true; reason = '5-9 depressed (<9.0%). Last 3 ticks >= 5.'; } break;
                    case 'under6': if (pct[6] < 8.5 && pct[7] < 8.5 && pct[8] < 8.5 && pct[9] < 8.5 && last3.every(t => t >= 6)) { trigger = true; reason = '6-9 depressed (<8.5%). Last 3 ticks >= 6.'; } break;
                    case 'under7': if (pct[7] < 8.5 && pct[8] < 8.5 && pct[9] < 8.5 && last3.every(t => t >= 7)) { trigger = true; reason = '7-9 depressed (<8.5%). Last 3 ticks >= 7.'; } break;
                    case 'under8': if (pct[8] < 8.5 && pct[9] < 8.5 && last3.every(t => t >= 8)) { trigger = true; reason = '8-9 depressed (<8.5%). Last 3 ticks >= 8.'; } break;
                    case 'even': const evens = pct[0] + pct[2] + pct[4] + pct[6] + pct[8]; if (evens < 42 || last4.every(t => t % 2 !== 0)) { trigger = true; reason = 'Even % < 42% or 4 consecutive Odds.'; } break;
                    case 'odd': const odds = pct[1] + pct[3] + pct[5] + pct[7] + pct[9]; if (odds < 42 || last4.every(t => t % 2 === 0)) { trigger = true; reason = 'Odd % < 42% or 4 consecutive Evens.'; } break;
                    case 'over2': if (pct[0] < 8.5 && pct[1] < 8.5 && pct[2] < 8.5 && last3.every(t => t <= 2)) { trigger = true; reason = '0,1,2 depressed (<8.5%). Last 3 ticks <= 2.'; } break;
                    case 'over4': if (pct[0] < 9.5 && pct[1] < 9.5 && pct[2] < 9.5 && pct[3] < 9.5 && pct[4] < 9.5 && last4.every(t => t < 4)) { trigger = true; reason = '0-4 depressed. Last 4 < 4.'; } break;
                    case 'match_5': if (pct[5] < 8.5) { trigger = true; reason = 'Digit 5 depressed (<8.5%) for Matches.'; } break;
                    case 'differ_5': if (pct[5] > 12) { trigger = true; reason = 'Digit 5 frequent (>12%) for Differs.'; } break;
                }
                
                if (trigger) { 
                    logSniper('🔥 TRIGGER: ' + reason); 
                    if (dynamicContract) {
                        executeTrade(botType, dynamicContract);
                    } else {
                        executeTrade(botType); 
                    }
                }
            }

            function executeTrade(botType, dynamicContract = null) {
                const amount = parseFloat(document.getElementById('stake-amount').value) || 0.35;
                let contractType = dynamicContract || ''; 
                let barrier = '';
                
                if (!dynamicContract) {
                    switch(botType) {
                        case 'atlas_over4': contractType = 'DIGITOVER'; barrier = '4'; break;
                        case 'over2': contractType = 'DIGITOVER'; barrier = '2'; break;
                        case 'under7': contractType = 'DIGITUNDER'; barrier = '7'; break;
                        case 'over3': contractType = 'DIGITOVER'; barrier = '3'; break;
                        case 'over5': contractType = 'DIGITOVER'; barrier = '5'; break;
                        case 'under5': contractType = 'DIGITUNDER'; barrier = '5'; break;
                        case 'under6': contractType = 'DIGITUNDER'; barrier = '6'; break;
                        case 'under8': contractType = 'DIGITUNDER'; barrier = '8'; break;
                        case 'over4': contractType = 'DIGITOVER'; barrier = '4'; break;
                        case 'even': contractType = 'DIGITEVEN'; break;
                        case 'odd': contractType = 'DIGITODD'; break;
                        case 'match_5': contractType = 'DIGITMATCH'; barrier = '5'; break;
                        case 'differ_5': contractType = 'DIGITDIFF'; barrier = '5'; break;
                    }
                } else {
                    if (dynamicContract === 'DIGITOVER') barrier = '2';
                    else if (dynamicContract === 'DIGITUNDER') barrier = '7';
                }

                const tradeRequest = { buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: contractType, currency: "USD", duration: 1, duration_unit: "t", symbol: selectedSymbol } };
                if (barrier) tradeRequest.parameters.barrier = barrier;
                logSniper('Placing trade: ' + contractType + ' on ' + selectedSymbol + ' | Stake: $' + amount);
                ws.send(JSON.stringify(tradeRequest));
            }

            function startBot() {
                isBotRunning = true; ticksBuffer = []; lastTicks = []; cooldownTicks = 0; tradeInProgress = false;
                selectedSymbol = document.getElementById('market-select').value;
                sessionStats = { wins: 0, losses: 0, profit: 0, consecutiveLosses: 0, totalTrades: 0 };
                updateSessionStats(0); 
                document.getElementById('start-bot-btn').style.display = 'none';
                document.getElementById('stop-bot-btn').style.display = 'inline-block';
                logSniper('Starting Sniper Engine on ' + selectedSymbol + '...');
                ws.send(JSON.stringify({ ticks_history: selectedSymbol, count: 100, end: "latest", style: "ticks" }));
                ws.send(JSON.stringify({ ticks: selectedSymbol, subscribe: 1 }));
            }

            function stopBot() {
                isBotRunning = false;
                document.getElementById('start-bot-btn').style.display = 'inline-block';
                document.getElementById('stop-bot-btn').style.display = 'none';
                ws.send(JSON.stringify({ forget_all: "ticks" }));
                logSniper('Bot stopped.');
            }

            function loadFreeBot(botType) {
                document.getElementById('bot-select').value = botType;
                showPage('bot-builder');
                logSniper('Loaded bot: ' + botType.toUpperCase() + '. Click Start Bot to run.');
            }

            document.getElementById('start-bot-btn')?.addEventListener('click', startBot);
            document.getElementById('stop-bot-btn')?.addEventListener('click', stopBot);

            // DBot XML Importer
            document.getElementById('xml-upload')?.addEventListener('change', function(event) {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    const xmlText = e.target.result;
                    const statusDiv = document.getElementById('upload-status');
                    try {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                        const getFieldValue = (blockType, fieldName) => {
                            const blocks = xmlDoc.getElementsByTagName('block');
                            for (let i = 0; i < blocks.length; i++) {
                                if (blocks[i].getAttribute('type') === blockType) {
                                    const fields = blocks[i].getElementsByTagName('field');
                                    for (let j = 0; j < fields.length; j++) {
                                        if (fields[j].getAttribute('name') === fieldName) return fields[j].textContent;
                                    }
                                }
                            }
                            return null;
                        };
                        const stakeAmount = getFieldValue('trade_definition_tradeoptions', 'AMOUNT');
                        const tradeType = getFieldValue('trade_definition_tradetype', 'TRADETYPE_LIST');
                        const barrier = getFieldValue('trade_definition_tradeoptions', 'BARRIER');
                        
                        if (stakeAmount) { document.getElementById('stake-amount').value = stakeAmount; }
                        if (tradeType) {
                            const upperType = tradeType.toUpperCase();
                            if (upperType.includes('OVER') || upperType.includes('DIGITOVER')) {
                                if (barrier === '2') document.getElementById('bot-select').value = 'over2';
                                else if (barrier === '3') document.getElementById('bot-select').value = 'over3';
                                else if (barrier === '5') document.getElementById('bot-select').value = 'over5';
                                else document.getElementById('bot-select').value = 'atlas_over4';
                            } else if (upperType.includes('UNDER') || upperType.includes('DIGITUNDER')) {
                                if (barrier === '5') document.getElementById('bot-select').value = 'under5';
                                else if (barrier === '6') document.getElementById('bot-select').value = 'under6';
                                else if (barrier === '8') document.getElementById('bot-select').value = 'under8';
                                else document.getElementById('bot-select').value = 'under7';
                            } else if (upperType.includes('EVEN')) { document.getElementById('bot-select').value = 'even'; }
                            else if (upperType.includes('ODD')) { document.getElementById('bot-select').value = 'odd'; }
                            else if (upperType.includes('MATCH')) { document.getElementById('bot-select').value = 'match_5'; }
                            else if (upperType.includes('DIFFER')) { document.getElementById('bot-select').value = 'differ_5'; }
                        }
                        statusDiv.style.display = 'block';
                        statusDiv.innerText = '✅ XML Parsed! Settings imported. Review and click Start Bot.';
                        logSniper('Imported DBot XML: ' + file.name);
                    } catch (err) {
                        console.error(err);
                        statusDiv.style.display = 'block';
                        statusDiv.style.color = 'var(--deriv-red)';
                        statusDiv.innerText = '❌ Error parsing XML.';
                    }
                };
                reader.readAsText(file);
            });

            // Manual Trade Buttons (Digits)
            document.getElementById('btn-over')?.addEventListener('click', () => {
                const amount = parseFloat(document.getElementById('manual-stake').value);
                selectedSymbol = document.getElementById('market-select').value;
                ws.send(JSON.stringify({ buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: "DIGITOVER", currency: "USD", duration: 1, duration_unit: "t", symbol: selectedSymbol, barrier: "4" } }));
            });
            document.getElementById('btn-under')?.addEventListener('click', () => {
                const amount = parseFloat(document.getElementById('manual-stake').value);
                selectedSymbol = document.getElementById('market-select').value;
                ws.send(JSON.stringify({ buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: "DIGITUNDER", currency: "USD", duration: 1, duration_unit: "t", symbol: selectedSymbol, barrier: "5" } }));
            });

            // Touch / No Touch Trade Buttons
            document.getElementById('btn-touch')?.addEventListener('click', () => {
                const amount = parseFloat(document.getElementById('tt-stake').value);
                const barrierVal = parseFloat(document.getElementById('tt-barrier').value);
                const durationVal = parseInt(document.getElementById('tt-duration').value);
                selectedSymbol = document.getElementById('market-select').value;
                ws.send(JSON.stringify({ buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: "TOUCH", currency: "USD", duration: durationVal, duration_unit: "t", symbol: selectedSymbol, barrier: barrierVal } }));
            });
            document.getElementById('btn-notouch')?.addEventListener('click', () => {
                const amount = parseFloat(document.getElementById('tt-stake').value);
                const barrierVal = parseFloat(document.getElementById('tt-barrier').value);
                const durationVal = parseInt(document.getElementById('tt-duration').value);
                selectedSymbol = document.getElementById('market-select').value;
                ws.send(JSON.stringify({ buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: "NOTOUCH", currency: "USD", duration: durationVal, duration_unit: "t", symbol: selectedSymbol, barrier: barrierVal } }));
            });

            // Accumulators Trade Buttons
            document.getElementById('btn-accu-up')?.addEventListener('click', () => {
                const amount = parseFloat(document.getElementById('accu-stake').value);
                const growth = parseFloat(document.getElementById('accu-growth').value) / 100;
                selectedSymbol = document.getElementById('market-select').value;
                ws.send(JSON.stringify({ buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: "ACCU", currency: "USD", growth_rate: growth, symbol: selectedSymbol } }));
            });
            document.getElementById('btn-accu-down')?.addEventListener('click', () => {
                const amount = parseFloat(document.getElementById('accu-stake').value);
                const growth = parseFloat(document.getElementById('accu-growth').value) / 100;
                selectedSymbol = document.getElementById('market-select').value;
                ws.send(JSON.stringify({ buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: "ACCU", currency: "USD", growth_rate: growth, symbol: selectedSymbol } }));
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Richie is running on port ${PORT}`));
