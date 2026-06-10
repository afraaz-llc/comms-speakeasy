<img src="favicon.svg" alt="comms logo — a swoosh circling a speech bubble" width="88">

# comms-pictochat

A peer-to-peer drawing chat for everyone on the same WiFi.

Open the page at the same coffee shop / library / friend's house as someone else, and you can chat with them — text, scribbles, or both at once — without an account, without a server, without anyone tracking what you're saying. PictoChat for the modern web.

This is a sub-project of the larger **[comms](https://comms.fish)** project — an open, ambient, privacy-first reimagining of casual chat.

## How it works

- **Same WiFi → same chatroom.** Each peer hashes their public IP into a room key. Everyone behind the same NAT (the coffee shop's router, your home WiFi) lands in the same room automatically. No invite codes, no QR codes, no setup.
- **Peer-to-peer over WebRTC.** Once peers find each other, messages flow directly between browsers via WebRTC DataChannels — end-to-end encrypted by the protocol itself.
- **No servers we operate.** Peer discovery rides on free public Nostr relays via [Trystero](https://github.com/dmotz/trystero). Nobody runs infrastructure, sees messages, or knows the peer count.
- **Vector drawings.** Scribbles are stored as stroke arrays, not images — typically ~2 KB instead of ~30 KB per message. Stays crisp at any zoom.
- **Ephemeral.** Messages live in your client until the tab closes. No history backfill for late joiners — like the original PictoChat.

## Running locally

This is a static HTML/CSS/JS app — no build step, no dependencies to install. Trystero is loaded from `esm.sh` at runtime.

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

## Privacy footnotes

Honest about the trade-offs:

- The Nostr relays used for peer discovery see "self-id X joined room Y." They never see message content (that's encrypted between peers in WebRTC), but they do see when you're online.
- The room key is `SHA-256(public_ip + salt)`. The salt prevents trivial dehashing, but anyone with the source code can hash known IPs and find rooms. The threat model assumes the app is open: if you're physically on the same WiFi, you can join.
- Carrier-grade NAT (some mobile carriers, large ISPs) shares public IPs across thousands of users — they'd all land in the same room. Could be a chaotic feature, could be noise. We treat it as a feature.

## Status

Front-end + networking work. Cross-device verified between laptop and phone over the same WiFi.

Still on the list:
- Chrome extension packaging (planned ship target)
- Website-embed mode — drop the same code onto a personal site, room-keyed by URL instead of public IP

## License

[AGPL-3.0](LICENSE). Forks running as a network service must share their source. Privacy-as-a-feature is the point: the code stays auditable, even when someone hosts a different build.

## Contributing

Issues and PRs welcome. The project is intentionally lightweight — vanilla HTML/CSS/JS, no build step, no frameworks, no external fonts. Keep it that way unless there's a real reason not to.
