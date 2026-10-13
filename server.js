const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());

// Pull values from Environment Variables (Render) or use local fallbacks
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_LOCAL_APP_ID';
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';

// Secure cookies automatically based on environment
const IS_SECURE = process.env.NODE_ENV === 'production';

// --- ROUTES ---

// 1. Login Route
app.get('/login', (req, res) => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    res.cookie('code_verifier', codeVerifier, { httpOnly: true, secure: IS_SECURE }); 
    res.cookie('oauth_state', state, { httpOnly: true, secure: IS_SECURE });

    const authUrl = `https://auth.deriv.com/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=trade%20account_manage&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;
    
    res.redirect(authUrl);
});

// 2. Callback Route
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const codeVerifier = req.cookies.code_verifier;
    const savedState = req.cookies.oauth_state;

    if (!code) return res.status(400).send('Error: No authorization code provided.');
    if (state !== savedState) return res.status(400).send('Error: State mismatch (CSRF warning).');

    try {
        const response = await axios.post('https://auth.deriv.com/oauth2/token', new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = response.data.access_token;
        res.cookie('access_token', accessToken, { httpOnly: true, secure: IS_SECURE });
        res.redirect('/');
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        res.status(500).send('Error exchanging token. Check server console.');
    }
});

// 3. API to check if user is logged in
app.get('/api/me', (req, res) => {
    const token = req.cookies.access_token;
    if (!token) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, token: token });
});

// 4. Logout
app.get('/logout', (req, res) => {
    res.clearCookie('access_token');
    res.redirect('/');
});

// 5. Serve the Frontend Website (HTML + CSS + JS)
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Richie</title>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f7f6; display: flex; justify-content: center; padding-top: 50px; margin: 0; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); width: 400px; text-align: center; }
            h1 { color: #333; font-size: 24px; }
            .card { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #eee; }
            .btn { display: inline-block; padding: 10px 20px; background: #ff444f; color: white; text-decoration: none; border-radius: 5px; border: none; cursor: pointer; font-weight: bold; margin-top: 10px; }
            .btn:hover { background: #e03e48; }
            .buy { background: #00a79d; margin-right: 5px; }
            .sell { background: #ff444f; }
            .logout { background: #666; margin-top: 20px; }
            #balance { font-size: 22px; font-weight: bold; color: #333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Richie</h1>
            
            <div id="logged-out-view">
                <p>Please log in to view your account and trade.</p>
                <a href="/login" class="btn">Login with Deriv</a>
            </div>

            <div id="logged-in-view" style="display: none;">
                <div class="card">
                    <h3>Account Balance</h3>
                    <p id="balance">Loading...</p>
                </div>
                <div class="card">
                    <h3>Quick Trade</h3>
                    <button id="buy-btn" class="btn buy">Buy Rise</button>
                    <button id="sell-btn" class="btn sell">Buy Fall</button>
                    <p id="trade-status"></p>
                </div>
                <a href="/logout" class="btn logout">Logout</a>
            </div>
        </div>

        <script>
            const APP_ID = '${CLIENT_ID}'; 

            fetch('/api/me')
                .then(res => res.json())
                .then(data => {
                    if (data.loggedIn) {
                        document.getElementById('logged-out-view').style.display = 'none';
                        document.getElementById('logged-in-view').style.display = 'block';
                        connectWebSocket(data.token);
                    }
                });

            let ws;

            function connectWebSocket(token) {
                ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=' + APP_ID);

                ws.onopen = () => {
                    ws.send(JSON.stringify({ authorize: token }));
                };

                ws.onmessage = (msg) => {
                    const data = JSON.parse(msg.data);

                    if (data.msg_type === 'authorize') {
                        if (data.error) { console.error('Auth error:', data.error.message); return; }
                        ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                    }

                    if (data.msg_type === 'balance') {
                        document.getElementById('balance').innerText = data.balance.balance + ' ' + data.balance.currency;
                    }

                    if (data.msg_type === 'buy') {
                        document.getElementById('trade-status').innerText = 'Trade placed! Contract ID: ' + data.buy.contract_id;
                    }
                    
                    if (data.error) {
                        document.getElementById('trade-status').innerText = 'Error: ' + data.error.message;
                    }
                };
            }

            document.getElementById('buy-btn')?.addEventListener('click', () => {
                ws.send(JSON.stringify({
                    buy: 1, price: 1,
                    parameters: { amount: 1, basis: "stake", contract_type: "CALL", currency: "USD", duration: 1, duration_unit: "m", symbol: "R_100" }
                }));
            });

            document.getElementById('sell-btn')?.addEventListener('click', () => {
                ws.send(JSON.stringify({
                    buy: 1, price: 1,
                    parameters: { amount: 1, basis: "stake", contract_type: "PUT", currency: "USD", duration: 1, duration_unit: "m", symbol: "R_100" }
                }));
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Richie is running on port ${PORT}`));
