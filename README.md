<img src="favicon.svg" alt="comms logo — a swoosh circling a speech bubble" width="88">

# comms-speakeasy

A peer-to-peer drawing chat for people who share a WiFi network — or, more precisely, a public IP address.

Open the page at the same coffee shop / library / friend's house as someone else, and you'll usually land in the same room — text, scribbles, or both at once, with no account and no sign-up. Your messages go straight from your browser to theirs and never touch a server. PictoChat for the modern web.

> ⚠️ **The name oversells it — read this.** A speakeasy has a door; this doesn't. The room is derived from your public IP, and **anyone who knows or guesses that IP can join from anywhere on Earth** — nothing checks that a joiner is actually on your network. speakeasy is for doodling at people near you, **not** for anything private, sensitive, or safety-critical. See [Privacy — what it does and doesn't protect](#privacy--what-it-does-and-doesnt-protect) before you rely on it for anything.

**Live at [speakeasy.comms.fish](https://speakeasy.comms.fish)**

This is a sub-project of the larger **[comms](https://comms.fish)** project — an open, ambient, privacy-first reimagining of casual chat.

## How it works

- **Shared public IP → same chatroom.** Each peer hashes their public IP into a room key. Everyone behind the same NAT (the coffee shop's router, your home WiFi) lands in the same room automatically — no invite codes, no setup. This keys on the *public egress IP*, though, not the WiFi itself: a VPN, mobile carrier-grade NAT, or a campus network can put total strangers in one room, or split people on one couch into two. See Privacy below.
- **Peer-to-peer over WebRTC.** Once peers find each other, messages flow directly between browsers via WebRTC DataChannels, encrypted in transit (DTLS). That hides them from the network path — but *not* from the other people in the room (they're the recipients), and not from a relay operator who turns malicious. It is not end-to-end encrypted in the sense that word usually implies; see Privacy below.
- **No servers we operate.** Peer discovery rides on free public Nostr relays via [Trystero](https://github.com/dmotz/trystero). Those relays never see your messages (those go peer-to-peer) — but five fixed ones, plus Google/Cloudflare STUN and GitHub Pages, each see your IP address and roughly when you're online, and a relay can count who's in a room. "Nobody runs infrastructure" would be false: five volunteers do, and the app depends on them.
- **Vector drawings.** Scribbles are stored as stroke arrays, not images — typically ~2 KB instead of ~30 KB per message. Stays crisp at any zoom.
- **Ephemeral — for the stock client.** Messages live in your client until the tab closes; there's no history backfill for late joiners, like the original PictoChat. But "ephemeral" describes *this app's* behavior, not the other people's: anyone in the room can screenshot or quietly log everything you send.

## Running locally

This is a static HTML/CSS/JS app — no build step, no dependencies to install. Trystero is vendored locally in [`./vendor`](vendor) — there is no runtime CDN dependency.

Serve the directory with any web server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` in two tabs. They should pair within ~10 seconds.

For cross-device testing on the same WiFi (laptop + phone), you need HTTPS — WebRTC requires a secure context outside of localhost. The fastest tunnel:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8000
```

Open the resulting `https://...trycloudflare.com/` URL on each device.

## Privacy — what it does and doesn't protect

The honest version. This app's whole point is casual, in-the-moment doodling; its privacy story is thinner than the "speakeasy" name suggests, and pretending otherwise would be worse than useless.

**What it genuinely does protect:**

- **Your messages never touch a server.** They go browser-to-browser over WebRTC and are encrypted in transit. No relay, CDN, or host we or anyone else runs ever sees them.
- **Nothing is written to disk.** No message is stored anywhere; there's no history and no backfill. (Your display name and pen settings are saved in your own browser's local storage — clear site data to remove them.)
- **A passive network snoop** — someone sniffing the café WiFi — sees encrypted traffic, not your messages.
- **No account, no email, no phone number.** There's no sign-up and no persistent identity to leak.

**What it does NOT protect you from — and cannot:**

- **Presence is enforced by nothing.** The room is `SHA-256(public IP + a public salt)`. The salt is not a secret (it's right here in the source), and mapping every routable IPv4 address to its room key takes about two core-hours, once. **Anyone who knows or guesses your public IP can compute your room and join from anywhere** — no server or peer checks that a joiner is actually on your network. "You have to be there" is not true.
- **Everyone in the room sees your IP address.** That's how peer-to-peer works; there's no relay to hide behind and no private mode.
- **Metadata leaks to third parties.** Five fixed Nostr relays (`relay.mostro.network`, `nostr-relay.corb.net`, `communities.nos.social`, `nostr.data.haus`, `inbox.mycelium.social`), plus Google/Cloudflare STUN and GitHub Pages, each learn your IP and roughly when you're online; a relay can also count who's in a room.
- **Anyone in the room can keep everything.** "Ephemeral" is about this app's behavior, not other people's — a peer can screenshot or run a bot that logs every message.
- **There is no identity.** Anyone can use any display name, including yours. You can't know who you're actually talking to.
- **A VPN doesn't help here** — it drops you into a room with strangers worldwide who share your exit node. **Tor doesn't work at all**, and if it appears to, that means WebRTC leaked around it and broadcast your real IP.

**Do NOT use speakeasy for** anything private, sensitive, or where being identified could hurt you — no whistleblowing, no organizing under a hostile government, no secrets. It's a toy for drawing at people near you. Treat anything you send as potentially public and permanent.

*(A fuller, line-by-line threat model lives in the [comms](https://comms.fish) project.)*

## Status

Front-end + networking work. Cross-device verified between laptop and phone over the same WiFi.

Still on the list:
- Chrome extension packaging (planned ship target)
- Website-embed mode — drop the same code onto a personal site, room-keyed by URL instead of public IP

## License

[AGPL-3.0](LICENSE). Forks running as a network service must share their source. Privacy-as-a-feature is the point: the code stays auditable, even when someone hosts a different build.

## Contributing

Issues and PRs welcome. The project is intentionally lightweight — vanilla HTML/CSS/JS, no build step, no frameworks, no external fonts. Keep it that way unless there's a real reason not to.
