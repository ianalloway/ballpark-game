# Ballpark

A real-time party game for 2–8 players, each on their own device.

**Play:** https://ianalloway.github.io/ballpark-game/

## How to play
1. One player hosts and gets a 4-letter room code. Everyone else joins with that code (or the share link) on their own phone or computer.
2. Each round shows a question whose answer is a number. Type your best guess before the 35-second clock runs out. Guesses stay hidden until everyone is in.
3. Closest guess scores 3 points, second closest scores 1. Hitting the answer exactly adds a 2-point bonus. Ties share the place.
4. After 8 rounds, the highest score wins.

## How it works
One static page, no backend. The host's browser runs the game and is the referee. Players' browsers talk to it through a public MQTT broker (EMQX) over secure WebSockets, so it works across different networks, phones and VPNs. The room code picks the channel. If the host closes their tab, the game ends.

Add `?local` to the URL to test with two tabs in one browser without any network.

## Security notes
The relay is public, so anyone who learns a room code can publish to that room. The page treats everything it receives as untrusted: game states are checked against a strict schema and every value is HTML-escaped before it is shown.

Each tab also makes a signing key pair (ECDSA P-256) that never leaves the tab. Your player id is a fingerprint of your public key, and every message you send is signed and timestamped, so another peer on the relay can't guess, join or leave under your seat or replay your old messages. The host signs every game state, and players trust the first host key they see for the room.

Limits: the host is trusted completely, since it runs the game and sees every guess. A peer who publishes a fake signed state before you join can still pose as the host to you (trust on first use), and anyone on the relay can close a room early by clearing its retained topics. Players who drop without saying goodbye are marked offline after 20 seconds.
