# GATEKEEP Technical Documentation

**Created at ETHGlobal New Delhi**

## Project Description

We are building a service that helps website owners get paid when AI agents or bots scrape their data. Right now, anyone can send a bot to a website and copy information for free. This is a big problem because:

1. Websites spend money creating and hosting valuable content
2. AI models and other automated tools can take that content without asking or paying

The tools that try to block bots (like CAPTCHAs) are annoying for real people and easy for smart agents to bypass. Our idea is to make a fair system where:

1. Human visitors can browse the site normally, with no changes at all
2. Automated agents (like AI scrapers, crawlers, or bots) have to pay a price whenever they access the data

The internet is moving toward a future where agents do most of the browsing. AI tools will read websites more than humans. If this keeps happening with no changes, creators will keep losing money and control over their own content. Our project gives websites a new way to protect and monetize their data while staying open and friendly to regular people.

## How It's Made

GATEKEEP is a middleware layer that sits between a website and the outside world. Think of it as a smart gate that every request must pass through before it reaches the actual website. It works at the network level, not inside your code, so it's invisible to normal users.

### The Process

**DNS-Level Setup (like Cloudflare)**  
A website owner adds our IPv4 address as an A record in their DNS. They also give us their original A name. This tiny change means all traffic to the website now flows through GATEKEEP first. No SDKs, no code changes, just a DNS update.

**Intercepting Requests**  
Once GATEKEEP is in place, every request to the website's URI - whether it's a human clicking a link or a bot scraping data - first hits our servers. We analyze the headers, behavior, and patterns of the request. Is this an automated agent or scraper? Humans pass through instantly. Agents trigger the next step.

**Payment Checkpoint**  
If we detect that the request is coming from an agent and the requested resource is marked as premium, we pause the request and show a payment gateway. The agent (or its owner) is asked to pay a small fee to access the data. Payments can be handled via JWT tokens, crypto/micropayments, all of them with x402. Once payment is confirmed, GATEKEEP forwards the request to the website and delivers the data back to the agent.

## Visual Architecture

### Traffic Flow Model

```
Standard Web (x402 Routes Not Protected):
[Agent] --get()--> [Website] --> [Protected Routes: /pay, /chat, /pro]
                                  Each route has different pricing:
                                  • /pay: $0.001
                                  • /chat: $0.002  
                                  • /pro: $0.004

With GATEKEEP (All Routes Protected):
[Agent] --get()--> [GATEKEEP Infra] --access--> [Website] --> [/pay, /chat, /pro]
         <--$0.005--                             All routes now monetized
```

### DNS Setup Diagram

```
Before GATEKEEP:
[Your A Record] <----> [Your Server]

After GATEKEEP:
[Your A Record] <----> [GATEKEEP A Record] <----> [Your Server]
                              |
                      [Detection & Payment Layer]
```

## How to Setup GATEKEEP

📺 **[Watch Setup Tutorial Video](https://youtube.com/gatekeep-setup)**

### Quick Start (2 minutes)

1. **Update DNS Records**
   - Log into your DNS provider
   - Change your A record to point to GATEKEEP's IP
   - Share your original server IP with us

2. **Configure Protected Routes**
   - Access GATEKEEP dashboard
   - Select which routes require payment
   - Set pricing per route or content type

3. **Monitor & Earn**
   - Watch real-time analytics
   - Track bot traffic and payments
   - Withdraw earnings anytime

## Technical Stack

- **Edge Proxy**: NGINX/Envoy for request routing
- **Detection Engine**: Python ML models for bot detection  
- **Payment Processing**: x402 protocol with JWT tokens
- **Blockchain**: Polygon for micropayments
- **Database**: PostgreSQL for logs, Redis for caching

## Key Features

### For Website Owners
- Zero code integration
- Instant setup via DNS
- Customizable pricing per route
- Real-time revenue tracking
- No impact on human visitors

### For AI Agents
- Programmatic payment API
- Multiple payment methods
- Fair, transparent pricing
- Instant access upon payment
- No CAPTCHAs to solve

## Future Roadmap

- Advanced ML detection for sophisticated bots
- Tiered pricing based on data value
- Enterprise API packages
- Content licensing marketplace
- Cross-site payment bundles

## Why GATEKEEP?

The web is evolving. Soon, most internet traffic will be AI agents browsing on behalf of humans. GATEKEEP ensures creators get paid fairly in this new economy while keeping the web open and accessible for everyone.

No more choosing between blocking bots entirely or giving away your content for free. With GATEKEEP, you can welcome all traffic - and get paid for it.

---

**Built with ❤️ at ETHGlobal New Delhi**