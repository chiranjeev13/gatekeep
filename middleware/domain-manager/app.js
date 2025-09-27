const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const execAsync = util.promisify(exec);
const app = express();
const PORT = 4000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
});

app.use('/api', adminLimiter);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminSecurePass456';
const SERVER_IP = process.env.SERVER_IP || 'YOUR_SERVER_IP';

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

async function loadDomains() {
    try {
        const data = await fs.readFile('/app/domains.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { _metadata: { version: "1.0", lastUpdated: new Date().toISOString(), totalDomains: 0 } };
    }
}

async function saveDomains(domains) {
    domains._metadata = {
        ...domains._metadata,
        lastUpdated: new Date().toISOString(),
        totalDomains: Object.keys(domains).filter(key => key !== '_metadata').length
    };
    await fs.writeFile('/app/domains.json', JSON.stringify(domains, null, 2));
}

function generateNginxConfig(domain, config) {
    const domainSafe = domain.replace(/\./g, '_');
    const sslConfig = config.ssl ? `
    # Try Let's Encrypt certificate first, fallback to self-signed
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    
    # Fallback certificates
    ssl_certificate /etc/nginx/certs/self-signed.crt;
    ssl_certificate_key /etc/nginx/certs/self-signed.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    
    add_header Strict-Transport-Security "max-age=63072000" always;` : '';
    
    return `
limit_req_zone $binary_remote_addr zone=${domainSafe}:10m rate=${config.rateLimit || 10}r/m;

map $cookie_verified_${domainSafe} $bypass_${domainSafe} {
    default 0;
    ~.+ 1;
}

server {
    listen 80;
    server_name ${domain} www.${domain};
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    ${config.ssl ? `
    # Redirect HTTP to HTTPS (except ACME challenges)
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${domain} www.${domain};
    
    ${sslConfig}` : ''}
    
    limit_req zone=${domainSafe} burst=${config.rateLimitBurst || 5} nodelay;
    error_page 429 = @verification;
    
    location @verification {
        if ($bypass_${domainSafe} = 0) {
            return 302 ${config.ssl ? 'https' : 'http'}://$server_name/ddos-verify/${domain};
        }
        proxy_pass http://${config.origin};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /ddos-verify/ {
        proxy_pass http://ddos_verification:3000/verify/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    ${!config.ssl ? `
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }` : ''}
    
    location / {
        if ($bypass_${domainSafe} = 0) {
            limit_req zone=${domainSafe} burst=${config.rateLimitBurst || 5} nodelay;
        }
        
        proxy_pass http://${config.origin};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
`;
}

async function regenerateNginxConfigs() {
    const domains = await loadDomains();
    
    try {
        const files = await fs.readdir('/app/nginx/sites');
        for (const file of files) {
            if (file !== 'default.conf') {
                await fs.unlink(`/app/nginx/sites/${file}`);
            }
        }
    } catch (error) {
        console.log('No existing configs to clear');
    }
    
    for (const [domain, config] of Object.entries(domains)) {
        if (domain === '_metadata' || !config.active) continue;
        
        const nginxConfig = generateNginxConfig(domain, config);
        await fs.writeFile(`/app/nginx/sites/${domain}.conf`, nginxConfig);
    }
    
    try {
        await execAsync('docker exec ddos_nginx nginx -s reload');
        console.log('Nginx configuration reloaded');
    } catch (error) {
        console.error('Error reloading nginx:', error.message);
    }
}

// API Routes
app.get('/api/domains', requireAuth, async (req, res) => {
    try {
        const domains = await loadDomains();
        const { _metadata, ...domainList } = domains;
        res.json({ domains: domainList, metadata: _metadata });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load domains' });
    }
});

app.post('/api/domains', requireAuth, async (req, res) => {
    try {
        const { domain, origin, password, rateLimit = 10, rateLimitBurst = 5, ssl = true } = req.body;
        
        if (!domain || !origin || !password) {
            return res.status(400).json({ error: 'Domain, origin, and password are required' });
        }
        
        const domains = await loadDomains();
        
        if (domains[domain]) {
            return res.status(409).json({ error: 'Domain already exists' });
        }
        
        domains[domain] = {
            origin,
            password,
            rateLimit: parseInt(rateLimit),
            rateLimitBurst: parseInt(rateLimitBurst),
            cookieValidityHours: 24,
            ssl: Boolean(ssl),
            active: true,
            createdAt: new Date().toISOString()
        };
        
        await saveDomains(domains);
        await regenerateNginxConfigs();
        
        res.status(201).json({ message: 'Domain added successfully', domain: domains[domain] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add domain' });
    }
});

// SSL provisioning endpoint
app.post('/api/domains/:domain/ssl', requireAuth, async (req, res) => {
    try {
        const { domain } = req.params;
        const domains = await loadDomains();
        
        if (!domains[domain]) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        
        console.log(`Starting SSL provisioning for ${domain}...`);
        
        // Run certbot to get SSL certificate
        const certbotCmd = `certbot certonly --webroot -w /opt/middleware/certbot-www -d ${domain} --non-interactive --agree-tos --email admin@${domain} --no-eff-email`;
        
        try {
            const { stdout, stderr } = await execAsync(certbotCmd);
            console.log('Certbot output:', stdout);
            
            // Check if certificate was created
            try {
                await fs.access(`/etc/letsencrypt/live/${domain}/fullchain.pem`);
                
                // Update domain to mark SSL as provisioned
                domains[domain].ssl = true;
                domains[domain].sslProvisioned = new Date().toISOString();
                domains[domain].sslProvider = 'letsencrypt';
                
                await saveDomains(domains);
                await regenerateNginxConfigs();
                
                res.json({ 
                    message: 'SSL certificate provisioned successfully',
                    domain: domain,
                    provider: 'letsencrypt',
                    provisionedAt: domains[domain].sslProvisioned
                });
            } catch (certError) {
                throw new Error('Certificate files not found after certbot execution');
            }
            
        } catch (error) {
            console.error('Certbot error:', error);
            res.status(500).json({ 
                error: 'Failed to provision SSL certificate', 
                details: error.message,
                instructions: `Please ensure:
                1. DNS is pointing to ${SERVER_IP} for ${domain}
                2. Domain is accessible via HTTP (port 80)
                3. No firewall blocking port 80
                4. Wait a few minutes for DNS propagation`,
                troubleshooting: {
                    dnsCheck: `dig ${domain}`,
                    httpCheck: `curl -I http://${domain}/.well-known/acme-challenge/test`,
                    serverIP: SERVER_IP
                }
            });
        }
    } catch (error) {
        console.error('SSL provisioning error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const domains = await loadDomains();
        const { _metadata, ...domainList } = domains;
        
        const stats = {
            totalDomains: Object.keys(domainList).length,
            activeDomains: Object.values(domainList).filter(d => d.active).length,
            sslEnabledDomains: Object.values(domainList).filter(d => d.ssl).length,
            lastUpdated: _metadata?.lastUpdated,
            uptime: process.uptime(),
            serverIP: SERVER_IP
        };
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

app.post('/api/reload', requireAuth, async (req, res) => {
    try {
        await regenerateNginxConfigs();
        res.json({ message: 'Configuration reloaded successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reload configuration' });
    }
});

app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DDoS Protection Admin</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; }
            .header { text-align: center; margin-bottom: 40px; }
            .card { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .api-info { background: #e3f2fd; }
            .credentials { background: #fff3e0; }
            code { background: #f5f5f5; padding: 2px 4px; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛡️ DDoS Protection System</h1>
            <p>Domain Management API</p>
        </div>
        
        <div class="card api-info">
            <h3>API Information</h3>
            <p><strong>Base URL:</strong> http://${SERVER_IP}:4000/api</p>
            <p><strong>Authentication:</strong> Bearer token required</p>
        </div>
        
        <div class="card credentials">
            <h3>Admin Credentials</h3>
            <p><strong>API Token:</strong> <code>${ADMIN_PASSWORD}</code></p>
        </div>
        
        <div class="card">
            <h3>API Endpoints</h3>
            <ul>
                <li><code>GET /api/domains</code> - List all domains</li>
                <li><code>POST /api/domains</code> - Add new domain</li>
                <li><code>POST /api/domains/:domain/ssl</code> - Provision SSL</li>
                <li><code>GET /api/stats</code> - System statistics</li>
            </ul>
        </div>
        
        <div class="card">
            <h3>DNS Configuration</h3>
            <p>Point your domains to: <code>${SERVER_IP}</code></p>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Domain Manager API running on port ${PORT}`);
});
