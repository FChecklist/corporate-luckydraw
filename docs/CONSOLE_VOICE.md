# Console voice (owner rule, 20 Nov 2026) - Corporate Lucky Draw

**Two voices, never mixed.**
- **Console voice** (the organizer, Host and Co-host screens, and the AI manuals that speak to the organizer): speaks TO the organizer as **you**. Polite, simple English, short sentences, no jargon. The audience is cautious HR people.
- **Game voice** (the player page `z.js`): speaks to the players.

**Rules for console text**
1. Say "you" and "your". Never "I", "my", "me", "myself" (a button is "Add to your list", not "Add to my list").
2. One idea per sentence. Say what happens next ("Press Start when you are ready.").
3. Polite, never blunt or threatening: "Please pay in your console", not "You must pay now".
4. No jargon: no "payload", "token", "endpoint", "hash", "bridge".
5. Keep the owner's approved texts word for word (the ID-invite text and the two start options below).
6. Consent tick-boxes are the person's own sentence ("I agree ...") and the owner's approved legal text. They are not rewritten here.
7. A test (`apps/web/test/console-voice.test.ts`) fails if `zc.js` contains "I", "my", "me" or "myself", or a blunt phrase.

**Approved wording (start options, exactly two)**
- "The game starts by itself" / "The game begins at the time you set. You do nothing." (value `auto`)
- "You start the game" / "The game waits for you. Press Start when you are ready." (value `manual`)
- There is no number-calling question in this game.

**Approved wording (invite)**
Invite people with just an ID / No names or personal details are needed. / Just upload or paste the IDs of the people you want to invite: employee ID, associate ID, vendor ID or customer ID, whichever you use. / Your invitee opens the game link and enters their ID. If it is on your list, they join and play. If it is not, you get a request to approve or decline. / The list and all IDs are deleted within 24 hours after the game ends.

**Before and after**
| Before | After |
|---|---|
| I press Draw | You start the game |
| Automatic at this time | The game starts by itself |
| Draw now | Start the game |
| Pay before the draw. Pay now. Copy payment link. | Pay in your console |
| Sign in (own sign-in) | Go to sign-in (at home.corporatetambola.com) |
