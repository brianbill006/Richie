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
                --bg-light: #f8f9fa;
                --bg-white: #ffffff;
                --text-dark: #333333;
                --text-muted: #666666;
                --border-color: #e0e0e0;
                --deriv-red: #ff444f;
                --deriv-blue: #4a90e2;
                --deriv-green: #00a79d;
                --deriv-yellow: #fbbf24;
                --shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; background-color: var(--bg-light); color: var(--text-dark); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
            
            /* Splash Screen */
            #splash-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #0e1525; color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 9999; transition: opacity 0.5s; }
            .splash-logo { font-size: 32px; font-weight: 700; margin-bottom: 10px; }
            .splash-sub { font-size: 14px; color: #8890a6; margin-bottom: 30px; }
            .progress-bar { width: 200px; height: 4px; background: #1e2336; border-radius: 2px; overflow: hidden; margin-bottom: 10px; }
            .progress-fill { height: 100%; background: var(--deriv-blue); width: 0%; transition: width 0.1s; }
            .progress-text { font-size: 12px; color: #8890a6; }

            #app { display: none; flex-direction: column; width: 100%; height: 100%; }
            
            /* Top Navigation */
            .navbar { background: var(--bg-white); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; padding: 0 20px; height: 60px; box-shadow: var(--shadow); z-index: 100; flex-shrink: 0; }
            .logo { font-size: 20px; font-weight: 700; color: var(--deriv-red); margin-right: 40px; }
            .nav-links { display: flex; gap: 10px; overflow-x: auto; height: 100%; align-items: center; }
            .nav-item { padding: 0 15px; height: 100%; display: flex; align-items: center; cursor: pointer; font-weight: 500; color: var(--text-muted); border-bottom: 3px solid transparent; transition: 0.2s; white-space: nowrap; }
            .nav-item:hover, .nav-item.active { color: var(--deriv-red); border-bottom-color: var(--deriv-red); }
            
            /* Account Selector */
            .account-selector { margin-left: auto; position: relative; cursor: pointer; user-select: none; }
            .account-trigger { display: flex; align-items: center; gap: 8px; background: var(--bg-light); padding: 8px 15px; border-radius: 20px; border: 1px solid var(--border-color); font-weight: 600; }
            .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
            .badge.real { background: #e6f7f6; color: #00a79d; border: 1px solid #00a79d; }
            .badge.demo { background: #fdf2e3; color: #f39c12; border: 1px solid #f39c12; }
            #currency-flag { font-size: 16px; }
            .arrow { font-size: 10px; color: var(--text-muted); }
            .account-dropdown { position: absolute; top: 110%; right: 0; background: var(--bg-white); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 220px; z-index: 1000; overflow: hidden; display: none; }
            .account-dropdown.show { display: block; }
            .dropdown-header { padding: 12px 15px; font-size: 11px; color: var(--text-muted); text-transform: uppercase; background: #f8f9fa; border-bottom: 1px solid var(--border-color); font-weight: 700; }
            .account-item { padding: 12px 15px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; font-size: 13px; transition: 0.2s; }
            .account-item:hover { background: #f8f9fa; }
            .account-item.active { background: #eef4fc; border-left: 3px solid var(--deriv-blue); }
            .account-item .bal { font-weight: 600; color: var(--deriv-green); }
            .logout-item { padding: 12px 15px; color: var(--deriv-red); font-weight: 600; font-size: 13px; cursor: pointer; text-align: center; border-top: 1px solid var(--border-color); }
            .logout-item:hover { background: #fff0f0; }

            /* Main Content */
            .main-content { flex: 1; overflow-y: auto; padding: 20px; padding-bottom: 80px; display: block; }
            .page { display: none; max-width: 1200px; margin: 0 auto; }
            .page.active { display: block; }
            
            /* Form Builder Styles */
            .builder-header { background: var(--deriv-blue); color: white; padding: 10px 15px; border-radius: 8px 8px 0 0; font-weight: 600; font-size: 14px; display: inline-block; margin-bottom: 0; }
            .builder-section { background: var(--bg-white); border: 1px solid var(--border-color); border-radius: 0 8px 8px 8px; padding: 20px; margin-bottom: 20px; box-shadow: var(--shadow); }
            .builder-sub-header { background: #eef4fc; color: #2c5aa0; padding: 8px 12px; border-radius: 6px; font-weight: 600; font-size: 13px; margin-bottom: 15px; display: inline-block; }
            .row { display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap; }
            .col { flex: 1; min-width: 150px; }
            .form-group { margin-bottom: 10px; }
            .form-group label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 500; }
            select, input[type="number"], input[type="text"] { width: 100%; padding: 10px; background: var(--bg-light); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-dark); font-size: 14px; outline: none; }
            select:focus, input:focus { border-color: var(--deriv-blue); }
            .checkbox-group { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--text-muted); }
            .checkbox-group input { width: auto; }

            /* Bottom Sticky Bar */
            .bottom-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: var(--bg-white); border-top: 1px solid var(--border-color); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 -2px 10px rgba(0,0,0,0.05); z-index: 100; }
            .btn-run { background: #1e3a8a; color: white; padding: 10px 30px; border-radius: 6px; font-weight: 600; display: flex; align-items: center; gap: 8px; border: none; cursor: pointer; }
            .execution-toggle { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px; color: var(--text-muted); }
            .toggle-switch { width: 40px; height: 20px; background: var(--deriv-green); border-radius: 20px; position: relative; cursor: pointer; }
            .toggle-switch::after { content: ''; width: 16px; height: 16px; background: white; border-radius: 50%; position: absolute; top: 2px; right: 2px; }
            
            /* Cards & Grid */
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .card { background: var(--bg-white); padding: 20px; border-radius: 12px; box-shadow: var(--shadow); border: 1px solid var(--border-color); cursor: pointer; }
            .card h3 { font-size: 14px; margin-bottom: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
            .card p { font-size: 13px; color: var(--text-muted); margin-bottom: 15px; }
            
            /* Signal AI */
            .scan-circle { width: 150px; height: 150px; border-radius: 50%; background: linear-gradient(135deg, #4a90e2, #8a2be2); display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; font-weight: bold; cursor: pointer; margin: 30px auto; box-shadow: 0 10px 20px rgba(74,144,226,0.3); transition: 0.2s; }
            .tab-btn { padding: 10px 20px; background: var(--bg-light); border: 1px solid var(--border-color); border-radius: 20px; cursor: pointer; font-weight: 500; margin: 0 5px; }
            .tab-btn.active { background: var(--deriv-blue); color: white; border-color: var(--deriv-blue); }
            #sniper-log { background: var(--bg-light); padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; color: var(--deriv-blue); height: 200px; overflow-y: auto; border: 1px solid var(--border-color); margin-top: 20px; }

            /* Manual Trader Digit Grid */
            .digit-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 15px; }
            .digit-box { background: var(--bg-white); padding: 15px 5px; border-radius: 50%; width: 60px; height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; border: 2px solid var(--border-color); margin: 0 auto; }
            .digit-box .pct { font-size: 10px; color: var(--text-muted); }
            .digit-box .label { font-weight: 700; font-size: 16px; }
            .digit-box.highlight { border-color: var(--deriv-green); }
            .digit-box.danger { border-color: var(--deriv-red); }

            /* Modals */
            .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 2000; }
            .modal-overlay.show { display: flex; }
            .modal-content { background: var(--bg-white); border-radius: 12px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
            .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; }
            .modal-header h2 { font-size: 18px; }
            .close-btn { font-size: 24px; cursor: pointer; color: var(--text-muted); }
            .modal-tabs { display: flex; gap: 5px; margin-bottom: 20px; }
            .modal-tab { padding: 8px 15px; background: var(--bg-light); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
            .modal-tab.active { background: var(--deriv-blue); color: white; border-color: var(--deriv-blue); }
            
            .trade-type-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
            .trade-type-item { padding: 15px; background: var(--bg-light); border: 1px solid var(--border-color); border-radius: 8px; text-align: center; cursor: pointer; font-weight: 500; }
            .trade-type-item:hover { background: #eef4fc; border-color: var(--deriv-blue); }

            /* Mobile Responsive */
            @media (max-width: 768px) {
                .navbar { flex-direction: column; height: auto; padding: 10px; }
                .logo { margin-right: 0; margin-bottom: 10px; }
                .nav-links { width: 100%; justify-content: space-between; overflow-x: auto; padding-bottom: 5px; }
                .nav-item { padding: 10px; font-size: 14px; }
                .account-selector { margin-left: 0; margin-top: 10px; width: 100%; display: flex; justify-content: center; }
                .account-dropdown { right: auto; left: 50%; transform: translateX(-50%); }
                .grid { grid-template-columns: 1fr; }
                .bottom-bar { flex-direction: column; gap: 10px; padding: 15px; }
                .btn-run { width: 100%; justify-content: center; }
                .trade-type-list { grid-template-columns: 1fr; }
            }
        </style>
    </head>
    <body>
        <!-- SPLASH SCREEN -->
        <div id="splash-screen">
            <div class="splash-logo">DT</div>
            <div class="splash-sub">Tredakit Pro Trading Workspace</div>
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            <div class="progress-text">Boot sequence <span id="progress-text">0%</span></div>
        </div>

        <!-- LOGIN SCREEN -->
        <div id="login-screen" style="display: none; justify-content: center; align-items: center; height: 100vh; flex-direction: column; background: var(--bg-light);">
            <div class="logo" style="font-size: 48px; margin-bottom: 20px;">Richie</div>
            <p style="color: var(--text-muted); margin-bottom: 20px;">Deriv Trading Workspace</p>
            <a href="/login" class="btn btn-primary" style="text-decoration:none; display:inline-block; width: auto; padding: 12px 40px; background: var(--deriv-red); color: white; border-radius: 8px;">Login with Deriv</a>
        </div>

        <!-- MAIN APP -->
        <div id="app">
            <!-- Top Navigation -->
            <div class="navbar">
                <div class="logo">Richie</div>
                <div class="nav-links">
                    <div class="nav-item active" data-target="dashboard">Dashboard</div>
                    <div class="nav-item" data-target="bot-builder">Bot Builder</div>
                    <div class="nav-item" data-target="free-bots">Free Bots</div>
                    <div class="nav-item" data-target="signal-ai">Signal AI</div>
                    <div class="nav-item" data-target="manual-trader">Manual Trader</div>
                </div>
                
                <div class="account-selector" id="account-selector">
                    <div class="account-trigger" onclick="toggleAccountDropdown(event)">
                        <span class="badge demo" id="account-badge">Demo</span>
                        <span id="currency-flag">🇺🇸</span>
                        <span id="balance">$0.00</span>
                        <span class="arrow">▼</span>
                    </div>
                    <div class="account-dropdown" id="account-dropdown">
                        <div class="dropdown-header">Your Accounts</div>
                        <div id="account-list-container"></div>
                        <div class="logout-item" onclick="window.location.href='/logout'">Logout</div>
                    </div>
                </div>
            </div>

            <!-- Main Content -->
            <div class="main-content">
                
                <!-- PAGE: DASHBOARD -->
                <div id="page-dashboard" class="page active">
                    <h1 style="margin-bottom: 20px;">Hello DOT91135862!</h1>
                    <div class="grid">
                        <div class="card" onclick="showPage('bot-builder')">
                            <h3>LOAD BOT</h3>
                            <p>Configure and run a custom trading bot.</p>
                        </div>
                        <div class="card" onclick="showPage('free-bots')">
                            <h3>PREMIUM BOTS</h3>
                            <p>Access high-accuracy pre-built strategies.</p>
                        </div>
                        <div class="card" onclick="showPage('signal-ai')">
                            <h3>SPEED BOT</h3>
                            <p>Fast AI-driven market scanning.</p>
                        </div>
                        <div class="card" onclick="showPage('manual-trader')">
                            <h3>MANUAL TRADING</h3>
                            <p>Take control with manual trades.</p>
                        </div>
                    </div>
                </div>

                <!-- PAGE: BOT BUILDER -->
                <div id="page-bot-builder" class="page">
                    <div class="builder-header">AI Bot Generator</div>
                    
                    <div class="builder-section">
                        <div class="builder-sub-header">1. Trade parameters</div>
                        <div class="row">
                            <div class="col">
                                <label>Market</label>
                                <select id="market-select">
                                    <option value="1HZ50V">Synthetic > Continuous Indices > Volatility 50 (1s) Index</option>
                                    <option value="1HZ100V">Synthetic > Continuous Indices > Volatility 100 (1s) Index</option>
                                    <option value="R_10">Synthetic > Continuous Indices > Volatility 10 Index</option>
                                    <option value="R_100">Synthetic > Continuous Indices > Volatility 100 Index</option>
                                </select>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col">
                                <label>Trade Type</label>
                                <select id="bot-select">
                                    <option value="over2_under7">Digits > Sniper: Over 2 & Under 7 Combo</option>
                                    <option value="atlas_over4">Digits > Atlas Sniper: Over 4 (Sharp)</option>
                                    <option value="over3">Digits > Sniper: Over 3</option>
                                    <option value="over5">Digits > Sniper: Over 5</option>
                                    <option value="under5">Digits > Sniper: Under 5</option>
                                    <option value="under6">Digits > Sniper: Under 6</option>
                                    <option value="under7">Digits > Sniper: Under 7</option>
                                    <option value="under8">Digits > Sniper: Under 8</option>
                                    <option value="even">Digits > Sniper: Even (High Accuracy)</option>
                                    <option value="odd">Digits > Sniper: Odd (High Accuracy)</option>
                                    <option value="match_5">Digits > Sniper: Matches 5</option>
                                    <option value="differ_5">Digits > Sniper: Differs 5</option>
                                </select>
                            </div>
                            <div class="col">
                                <label>Contract Type</label>
                                <select id="contract-type">
                                    <option value="both">Both</option>
                                    <option value="updown">Up/Down</option>
                                </select>
                            </div>
                            <div class="col">
                                <label>Default Candle Interval</label>
                                <select id="candle-interval">
                                    <option value="1m">1 minute</option>
                                    <option value="5m">5 minutes</option>
                                </select>
                            </div>
                        </div>
                        <div class="checkbox-group">
                            <input type="checkbox" id="restart-error">
                            <label for="restart-error">Restart buy/sell on error (disable for better performance)</label>
                        </div>
                    </div>

                    <div class="builder-section">
                        <div class="builder-sub-header">2. Purchase conditions</div>
                        <div class="row">
                            <div class="col">
                                <label>Purchase</label>
                                <select id="purchase-direction">
                                    <option value="rise">Rise</option>
                                    <option value="fall">Fall</option>
                                </select>
                            </div>
                            <div class="col">
                                <label>Allow Bulk Purchase</label>
                                <select id="bulk-purchase">
                                    <option value="no">No</option>
                                    <option value="yes">Yes</option>
                                </select>
                            </div>
                            <div class="col">
                                <label>No. of Trades</label>
                                <input type="number" id="num-trades" value="1" min="1">
                            </div>
                        </div>
                    </div>

                    <div class="builder-section">
                        <div class="builder-sub-header">3. Trade options</div>
                        <div class="row">
                            <div class="col">
                                <label>Duration</label>
                                <select id="duration-type">
                                    <option value="t">Ticks</option>
                                    <option value="m">Minutes</option>
                                </select>
                            </div>
                            <div class="col">
                                <label>Ticks</label>
                                <input type="number" id="duration-value" value="5" min="1">
                            </div>
                            <div class="col">
                                <label>Stake (USD)</label>
                                <input type="number" id="stake-amount" value="0.35" step="0.01" min="0.35">
                            </div>
                        </div>
                    </div>

                    <div class="builder-section" style="margin-top: 20px;">
                        <h3 style="font-size: 14px; margin-bottom: 10px; color: var(--text-muted);">Live Analysis Log</h3>
                        <div id="sniper-log">Waiting for bot to start...</div>
                    </div>
                </div>

                <!-- PAGE: FREE BOTS -->
                <div id="page-free-bots" class="page">
                    <div class="grid">
                        <div class="card" style="background: #fff9e6; border-color: var(--deriv-yellow);" onclick="loadFreeBot('over2_under7')">
                            <h4>5. Recover Over Bandwagon</h4>
                            <p>Automate your trades with our freebots</p>
                            <button class="btn btn-primary" style="margin-top: 10px;">Load Bot</button>
                        </div>
                        <div class="card" style="background: #fff9e6; border-color: var(--deriv-yellow);" onclick="loadFreeBot('atlas_over4')">
                            <h4>20. Over Edge Money Bot</h4>
                            <p>Automate your trades with our freebots</p>
                            <button class="btn btn-primary" style="margin-top: 10px;">Load Bot</button>
                        </div>
                        <div class="card" style="background: #fff9e6; border-color: var(--deriv-yellow);" onclick="loadFreeBot('over3')">
                            <h4>17. 3 by 3 Money Maker</h4>
                            <p>Automate your trades with our freebots</p>
                            <button class="btn btn-primary" style="margin-top: 10px;">Load Bot</button>
                        </div>
                        <div class="card" style="background: #fff9e6; border-color: var(--deriv-yellow);" onclick="loadFreeBot('even')">
                            <h4>EVEN_MYTH V2.0</h4>
                            <p>Automate your trades with our freebots</p>
                            <button class="btn btn-primary" style="margin-top: 10px;">Load Bot</button>
                        </div>
                        <div class="card" style="background: #fff9e6; border-color: var(--deriv-yellow);" onclick="loadFreeBot('over5')">
                            <h4>WEALTH GENERATOR</h4>
                            <p>Automate your trades with our freebots</p>
                            <button class="btn btn-primary" style="margin-top: 10px;">Load Bot</button>
                        </div>
                        <div class="card" style="background: #fff9e6; border-color: var(--deriv-yellow);" onclick="loadFreeBot('under5')">
                            <h4>VENEEFX ACCOUNT FLIPPER</h4>
                            <p>Automate your trades with our freebots</p>
                            <button class="btn btn-primary" style="margin-top: 10px;">Load Bot</button>
                        </div>
                    </div>
                </div>

                <!-- PAGE: SIGNAL AI -->
                <div id="page-signal-ai" class="page">
                    <div class="card" style="max-width: 600px; margin: 0 auto; text-align: center; cursor: default;">
                        <h3>Signal AI</h3>
                        <div style="margin: 20px 0;">
                            <button class="tab-btn active" onclick="setSignalTab('overunder')">Over / Under</button>
                            <button class="tab-btn" onclick="setSignalTab('evenodd')">Even / Odd</button>
                        </div>
                        <div class="scan-circle" id="scan-btn">SCAN</div>
                        <p style="color: var(--text-muted); font-size: 14px;">Tap scan to find an entry point.</p>
                        <div id="sniper-log" style="text-align: left; cursor: default;">Scanning...</div>
                    </div>
                </div>

                <!-- PAGE: MANUAL TRADER -->
                <div id="page-manual-trader" class="page">
                    <div class="card" style="cursor: default;">
                        <h3>Volatility 50 (1s) Index</h3>
                        <div class="digit-grid" id="digit-grid"></div>
                    </div>
                    <div class="card" style="margin-top: 20px; max-width: 400px; cursor: default;">
                        <h3>Trade Type</h3>
                        <div class="form-group">
                            <label>Stake (USD)</label>
                            <input type="number" id="manual-stake" value="1.00" step="0.01">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button class="btn btn-green" onclick="openTradeTypesModal()" style="background: var(--deriv-blue); color: white; padding: 12px; border-radius: 8px;">Trade Types</button>
                            <button class="btn btn-primary" onclick="openScannerModal()" style="background: var(--deriv-red); color: white; padding: 12px; border-radius: 8px;">Entry Scanner</button>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Bottom Sticky Bar (AI Bot Generator) -->
            <div class="bottom-bar" id="bot-builder-bar" style="display: none;">
                <button class="btn-run" id="start-bot-btn">▶ Run</button>
                <div class="execution-toggle">
                    <span>Execution</span>
                    <span style="color: #000; font-weight: 700;">FAST</span>
                    <div class="toggle-switch"></div>
                </div>
            </div>
        </div>

        <!-- MODAL: TRADE TYPES -->
        <div class="modal-overlay" id="trade-types-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Trade Types</h2>
                    <span class="close-btn" onclick="closeModal('trade-types-modal')">&times;</span>
                </div>
                <div class="trade-type-list">
                    <div class="trade-type-item">Accumulators</div>
                    <div class="trade-type-item">Vanillas (Call/Put)</div>
                    <div class="trade-type-item">Turbos</div>
                    <div class="trade-type-item">Digits (Matches/Differs)</div>
                    <div class="trade-type-item">Digits (Even/Odd)</div>
                    <div class="trade-type-item">Digits (Over/Under)</div>
                    <div class="trade-type-item">Ups & Downs (Rise/Fall)</div>
                    <div class="trade-type-item">Ups & Downs (Higher/Lower)</div>
                    <div class="trade-type-item">Touch/No Touch</div>
                    <div class="trade-type-item">Multipliers</div>
                </div>
            </div>
        </div>

        <!-- MODAL: ENTRY SCANNER -->
        <div class="modal-overlay" id="scanner-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Entry Scanner</h2>
                    <span class="close-btn" onclick="closeModal('scanner-modal')">&times;</span>
                </div>
                <div class="modal-tabs">
                    <div class="modal-tab active">Over1 / Under8</div>
                    <div class="modal-tab">Over2 / Under7</div>
                    <div class="modal-tab">Over3 / Under6</div>
                </div>
                <div class="builder-section" style="border-radius: 8px; padding: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 600;">Digits Scanner</div>
                            <div style="font-size: 12px; color: var(--text-muted);">Scans Over 1 and Under 8 with recovery confirmation.</div>
                        </div>
                        <div style="background: #eef4fc; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">TICKS 3000</div>
                    </div>
                    <div class="row" style="margin-top: 15px;">
                        <div class="col">
                            <label>Selected Market</label>
                            <div style="padding: 10px; background: var(--bg-light); border-radius: 6px; font-size: 13px;">Scan to find the best market</div>
                        </div>
                        <div class="col">
                            <label>Trade Type</label>
                            <div style="padding: 10px; background: var(--bg-light); border-radius: 6px; font-size: 13px;">Waiting for scan</div>
                        </div>
                    </div>
                    <div style="margin-top: 10px; font-size: 13px; color: var(--text-muted);">Not scanned yet</div>
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="btn btn-primary" style="background: var(--deriv-blue);" onclick="openScannerParams()">Scan Markets</button>
                        <button class="btn btn-secondary" style="background: var(--deriv-green); color: white;" onclick="closeModal('scanner-modal')">Load Scanner Bot</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- MODAL: SCANNER PARAMETERS -->
        <div class="modal-overlay" id="scanner-params-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Scanner Parameters</h2>
                    <span class="close-btn" onclick="closeModal('scanner-params-modal')">&times;</span>
                </div>
                <div class="row">
                    <div class="col">
                        <label>Stake</label>
                        <input type="number" value="0.5" step="0.1">
                    </div>
                    <div class="col">
                        <label>Martingale</label>
                        <input type="number" value="2" step="1">
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                        <label>Number of Wins</label>
                        <input type="number" value="5" step="1">
                    </div>
                    <div class="col">
                        <label>No. of Digits to Check</label>
                        <input type="number" value="1" step="1">
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                        <label>Stop Loss</label>
                        <input type="number" value="50" step="1">
                    </div>
                    <div class="col" style="display: flex; align-items: flex-end;">
                        <div class="checkbox-group" style="margin-bottom: 10px;">
                            <input type="checkbox" id="use-martingale" checked>
                            <label for="use-martingale">Use Martingale</label>
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="closeModal('scanner-params-modal')">Cancel</button>
                    <button class="btn btn-primary" style="background: var(--deriv-blue);" onclick="closeModal('scanner-params-modal')">Launch Bot</button>
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
            let currentSignalTab = 'overunder';
            
            let sessionStats = { wins: 0, losses: 0, profit: 0, consecutiveLosses: 0, totalTrades: 0 };

            // --- SPLASH SCREEN LOGIC ---
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 100) progress = 100;
                document.getElementById('progress-fill').style.width = progress + '%';
                document.getElementById('progress-text').innerText = Math.floor(progress) + '%';
                if (progress === 100) {
                    clearInterval(progressInterval);
                    setTimeout(() => {
                        document.getElementById('splash-screen').style.opacity = '0';
                        setTimeout(() => {
                            document.getElementById('splash-screen').style.display = 'none';
                            checkAuth();
                        }, 500);
                    }, 500);
                }
            }, 100);

            function checkAuth() {
                fetch('/api/me').then(res => res.json()).then(data => {
                    if (data.loggedIn) {
                        document.getElementById('login-screen').style.display = 'none';
                        document.getElementById('app').style.display = 'flex';
                        connectWebSocket(data.token);
                    } else {
                        document.getElementById('login-screen').style.display = 'flex';
                    }
                });
            }

            // --- UI NAVIGATION ---
            function showPage(pageId) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.getElementById('page-' + pageId).classList.add('active');
                document.querySelector('.nav-item[data-target="' + pageId + '"]').classList.add('active');
                
                const bottomBar = document.getElementById('bot-builder-bar');
                if (pageId === 'bot-builder') {
                    bottomBar.style.display = 'flex';
                } else {
                    bottomBar.style.display = 'none';
                }
            }

            document.querySelectorAll('.nav-item[data-target]').forEach(item => {
                item.addEventListener('click', () => showPage(item.getAttribute('data-target')));
            });

            // --- MODAL LOGIC ---
            function openTradeTypesModal() { document.getElementById('trade-types-modal').classList.add('show'); }
            function openScannerModal() { document.getElementById('scanner-modal').classList.add('show'); }
            function openScannerParams() { 
                closeModal('scanner-modal');
                document.getElementById('scanner-params-modal').classList.add('show'); 
            }
            function closeModal(modalId) { document.getElementById(modalId).classList.remove('show'); }

            // Close modals on outside click
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) overlay.classList.remove('show');
                });
            });

            // --- ACCOUNT DROPDOWN ---
            function toggleAccountDropdown(event) {
                event.stopPropagation();
                document.getElementById('account-dropdown').classList.toggle('show');
            }
            document.addEventListener('click', (e) => {
                const dropdown = document.getElementById('account-dropdown');
                const selector = document.getElementById('account-selector');
                if (dropdown.classList.contains('show') && !selector.contains(e.target)) {
                    dropdown.classList.remove('show');
                }
            });

            function populateAccountList(accountList, currentIsVirtual, currentBalance, currentCurrency) {
                const container = document.getElementById('account-list-container');
                container.innerHTML = '';
                const accounts = accountList && accountList.length > 0 ? accountList : [
                    { is_virtual: currentIsVirtual ? 1 : 0, currency: currentCurrency, balance: currentBalance }
                ];
                accounts.forEach(acc => {
                    const isVirtual = acc.is_virtual === 1;
                    const type = isVirtual ? 'Demo' : 'Real';
                    const currency = acc.currency || 'USD';
                    const bal = acc.balance ? parseFloat(acc.balance).toFixed(2) : '0.00';
                    const item = document.createElement('div');
                    item.className = 'account-item' + (isVirtual === currentIsVirtual ? ' active' : '');
                    let flagEmoji = '💱';
                    if (currency === 'USD') flagEmoji = '🇺🇸';
                    else if (currency === 'EUR') flagEmoji = '🇪🇺';
                    else if (currency === 'GBP') flagEmoji = '🇬🇧';
                    item.innerHTML = '<div><div class="type">' + type + ' Account</div><div class="curr">' + flagEmoji + ' ' + currency + '</div></div><div class="bal">$' + bal + '</div>';
                    item.onclick = (e) => {
                        e.stopPropagation();
                        if (isVirtual !== currentIsVirtual) {
                            alert('To switch to your ' + type + ' account, please log out and log in with your ' + type + ' account. Deriv OAuth tokens are account-specific.');
                        }
                        document.getElementById('account-dropdown').classList.remove('show');
                    };
                    container.appendChild(item);
                });
            }

            // --- WEBSOCKET & TRADING LOGIC ---
            function connectWebSocket(token) {
                ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=' + APP_ID);
                ws.onopen = () => { ws.send(JSON.stringify({ authorize: token })); };
                ws.onmessage = (msg) => { handleWebSocketMessage(JSON.parse(msg.data)); };
            }

            function handleWebSocketMessage(data) {
                if (data.msg_type === 'authorize') {
                    if (data.error) { console.error('Auth error:', data.error.message); return; }
                    const isVirtual = data.authorize.is_virtual === 1;
                    const accountBadge = document.getElementById('account-badge');
                    if (isVirtual) { accountBadge.innerText = 'Demo'; accountBadge.className = 'badge demo'; }
                    else { accountBadge.innerText = 'Real'; accountBadge.className = 'badge real'; }
                    const currency = data.authorize.currency;
                    const flagEl = document.getElementById('currency-flag');
                    if (currency === 'USD') flagEl.innerText = '🇺🇸';
                    else if (currency === 'EUR') flagEl.innerText = '🇪🇺';
                    else if (currency === 'GBP') flagEl.innerText = '🇬🇧';
                    else flagEl.innerText = '💱';
                    ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                    const accList = data.authorize.account_list || [];
                    populateAccountList(accList, isVirtual, data.balance.balance, currency);
                }
                if (data.msg_type === 'balance') {
                    document.getElementById('balance').innerText = data.balance.balance + ' ' + data.balance.currency;
                    const accList = data.authorize ? (data.authorize.account_list || []) : [];
                    const isVirtual = data.balance.loginid.startsWith('VR');
                    populateAccountList(accList, isVirtual, data.balance.balance, data.balance.currency);
                }
                if (data.msg_type === 'history') { data.history.prices.forEach(price => processTick(price)); }
                if (data.msg_type === 'tick') { processTick(data.tick.quote); }
                if (data.msg_type === 'buy') {
                    document.getElementById('sniper-log').innerHTML += '<br>✅ Trade placed! ID: ' + data.buy.contract_id;
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
                    document.getElementById('sniper-log').innerHTML += '<br>❌ Error: ' + data.error.message; 
                    tradeInProgress = false; 
                }
            }

            function updateSessionStats(profit) {
                sessionStats.totalTrades++;
                sessionStats.profit += profit;
                if (profit > 0) { sessionStats.wins++; sessionStats.consecutiveLosses = 0; document.getElementById('sniper-log').innerHTML += '<br>🎉 WIN! +$' + profit.toFixed(2); }
                else { sessionStats.losses++; sessionStats.consecutiveLosses++; document.getElementById('sniper-log').innerHTML += '<br>💀 LOSS. $' + profit.toFixed(2); }
            }

            function checkDisciplineLimits() {
                const maxLosses = 3; 
                if (sessionStats.consecutiveLosses >= maxLosses) { document.getElementById('sniper-log').innerHTML += '<br>🛑 Max consecutive losses reached. Stopped.'; stopBot(); }
                else { cooldownTicks = 5; }
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
                    gridHtml += '<div class="label">' + i + '</div>';
                    gridHtml += '<div class="pct">' + pct + '%</div>';
                    gridHtml += '</div>';
                }
                document.getElementById('digit-grid').innerHTML = gridHtml;
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
                        if (lowOver2) { trigger = true; dynamicContract = 'DIGITOVER'; reason = '0,1,2 depressed.'; }
                        else if (highUnder7) { trigger = true; dynamicContract = 'DIGITUNDER'; reason = '7,8,9 depressed.'; }
                        break;
                    case 'atlas_over4':
                        const lowDigitsUnder10 = [0,1,2,3,4].every(d => pct[d] < 10);
                        const highCount = pct.filter(p => p > 10).length;
                        const maxPct = Math.max(...pct);
                        const maxDigit = pct.indexOf(maxPct);
                        const greenBarAway = maxDigit >= 6;
                        const last3Under4 = last3.every(t => t < 4);
                        if (lowDigitsUnder10 && highCount <= 2 && greenBarAway && last3Under4) { trigger = true; reason = 'ATLAS TRIGGER.'; }
                        break;
                    case 'over3': if (pct[0] < 8.5 && pct[1] < 8.5 && pct[2] < 8.5 && pct[3] < 8.5 && last3.every(t => t <= 3)) { trigger = true; reason = '0-3 depressed.'; } break;
                    case 'over5': if (pct[0] < 9.0 && pct[1] < 9.0 && pct[2] < 9.0 && pct[3] < 9.0 && pct[4] < 9.0 && last3.every(t => t <= 4)) { trigger = true; reason = '0-4 depressed.'; } break;
                    case 'under5': if (pct[5] < 9.0 && pct[6] < 9.0 && pct[7] < 9.0 && pct[8] < 9.0 && pct[9] < 9.0 && last3.every(t => t >= 5)) { trigger = true; reason = '5-9 depressed.'; } break;
                    case 'under6': if (pct[6] < 8.5 && pct[7] < 8.5 && pct[8] < 8.5 && pct[9] < 8.5 && last3.every(t => t >= 6)) { trigger = true; reason = '6-9 depressed.'; } break;
                    case 'under7': if (pct[7] < 8.5 && pct[8] < 8.5 && pct[9] < 8.5 && last3.every(t => t >= 7)) { trigger = true; reason = '7-9 depressed.'; } break;
                    case 'under8': if (pct[8] < 8.5 && pct[9] < 8.5 && last3.every(t => t >= 8)) { trigger = true; reason = '8-9 depressed.'; } break;
                    case 'even': const evens = pct[0] + pct[2] + pct[4] + pct[6] + pct[8]; if (evens < 42 || last4.every(t => t % 2 !== 0)) { trigger = true; reason = 'Even % < 42% or 4 Odds.'; } break;
                    case 'odd': const odds = pct[1] + pct[3] + pct[5] + pct[7] + pct[9]; if (odds < 42 || last4.every(t => t % 2 === 0)) { trigger = true; reason = 'Odd % < 42% or 4 Evens.'; } break;
                    case 'match_5': if (pct[5] < 8.5) { trigger = true; reason = 'Digit 5 depressed.'; } break;
                    case 'differ_5': if (pct[5] > 12) { trigger = true; reason = 'Digit 5 frequent.'; } break;
                }
                
                if (trigger) { 
                    document.getElementById('sniper-log').innerHTML += '<br>🔥 TRIGGER: ' + reason; 
                    if (dynamicContract) { executeTrade(botType, dynamicContract); } 
                    else { executeTrade(botType); }
                }
            }

            function executeTrade(botType, dynamicContract = null) {
                const amount = parseFloat(document.getElementById('stake-amount').value) || 0.35;
                const durationType = document.getElementById('duration-type').value;
                const durationValue = parseInt(document.getElementById('duration-value').value) || 5;
                let contractType = dynamicContract || ''; 
                let barrier = '';
                if (!dynamicContract) {
                    switch(botType) {
                        case 'atlas_over4': contractType = 'DIGITOVER'; barrier = '4'; break;
                        case 'over3': contractType = 'DIGITOVER'; barrier = '3'; break;
                        case 'over5': contractType = 'DIGITOVER'; barrier = '5'; break;
                        case 'under5': contractType = 'DIGITUNDER'; barrier = '5'; break;
                        case 'under6': contractType = 'DIGITUNDER'; barrier = '6'; break;
                        case 'under7': contractType = 'DIGITUNDER'; barrier = '7'; break;
                        case 'under8': contractType = 'DIGITUNDER'; barrier = '8'; break;
                        case 'even': contractType = 'DIGITEVEN'; break;
                        case 'odd': contractType = 'DIGITODD'; break;
                        case 'match_5': contractType = 'DIGITMATCH'; barrier = '5'; break;
                        case 'differ_5': contractType = 'DIGITDIFF'; barrier = '5'; break;
                    }
                } else {
                    if (dynamicContract === 'DIGITOVER') barrier = '2';
                    else if (dynamicContract === 'DIGITUNDER') barrier = '7';
                }
                const tradeRequest = { buy: 1, price: amount, parameters: { amount: amount, basis: "stake", contract_type: contractType, currency: "USD", duration: durationValue, duration_unit: durationType, symbol: selectedSymbol } };
                if (barrier) tradeRequest.parameters.barrier = barrier;
                document.getElementById('sniper-log').innerHTML += '<br>Placing trade: ' + contractType + ' | Duration: ' + durationValue + ' ' + durationType;
                ws.send(JSON.stringify(tradeRequest));
            }

            function startBot() {
                isBotRunning = true; ticksBuffer = []; lastTicks = []; cooldownTicks = 0; tradeInProgress = false;
                selectedSymbol = document.getElementById('market-select').value;
                sessionStats = { wins: 0, losses: 0, profit: 0, consecutiveLosses: 0, totalTrades: 0 };
                document.getElementById('start-bot-btn').innerHTML = '⏹ Stop';
                document.getElementById('start-bot-btn').style.background = 'var(--deriv-red)';
                document.getElementById('sniper-log').innerHTML = 'Starting Sniper Engine on ' + selectedSymbol + '...';
                ws.send(JSON.stringify({ ticks_history: selectedSymbol, count: 100, end: "latest", style: "ticks" }));
                ws.send(JSON.stringify({ ticks: selectedSymbol, subscribe: 1 }));
            }

            function stopBot() {
                isBotRunning = false;
                document.getElementById('start-bot-btn').innerHTML = '▶ Run';
                document.getElementById('start-bot-btn').style.background = '#1e3a8a';
                ws.send(JSON.stringify({ forget_all: "ticks" }));
                document.getElementById('sniper-log').innerHTML += '<br>Bot stopped.';
            }

            function loadFreeBot(botType) {
                document.getElementById('bot-select').value = botType;
                showPage('bot-builder');
                document.getElementById('sniper-log').innerHTML += 'Loaded bot: ' + botType.toUpperCase();
            }

            function setSignalTab(tab) {
                currentSignalTab = tab;
                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                event.target.classList.add('active');
            }

            document.getElementById('start-bot-btn')?.addEventListener('click', () => {
                if (isBotRunning) { stopBot(); } else { startBot(); }
            });

            document.getElementById('scan-btn')?.addEventListener('click', () => {
                document.getElementById('sniper-log').innerHTML = 'Scanning for ' + currentSignalTab + ' entry...';
                if (currentSignalTab === 'overunder') { document.getElementById('bot-select').value = 'atlas_over4'; }
                else { document.getElementById('bot-select').value = 'even'; }
                startBot();
            });

            // Manual Trade Buttons
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
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Richie is running on port ${PORT}`));
