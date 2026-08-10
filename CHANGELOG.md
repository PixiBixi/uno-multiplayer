# Changelog

- - -
## [v1.4.0](https://github.com/PixiBixi/uno-multiplayer/compare/db398070890ac82ff3e3848aa940b8835e60d4c1..v1.4.0) - 2026-08-10
#### Features
- (**web**) let toasts close themselves - ([db39807](https://github.com/PixiBixi/uno-multiplayer/commit/db398070890ac82ff3e3848aa940b8835e60d4c1)) - Jeremy Delgado

- - -

## [v1.3.0](https://github.com/PixiBixi/uno-multiplayer/compare/3273fba2d08486db5711a38538087893e86f83d6..v1.3.0) - 2026-08-10
#### Features
- (**web**) give the game a favicon - ([3273fba](https://github.com/PixiBixi/uno-multiplayer/commit/3273fba2d08486db5711a38538087893e86f83d6)) - Jeremy Delgado

- - -

## [v1.2.0](https://github.com/PixiBixi/uno-multiplayer/compare/8cca3395400dfaf55a73c95aaff9f43d07b84d73..v1.2.0) - 2026-08-10
#### Features
- (**protocol**) put the table rules on the wire and add room:configure - ([a9a8d8d](https://github.com/PixiBixi/uno-multiplayer/commit/a9a8d8d02a32b7aa04cc0d24f58ee76109b7afdb)) - Jeremy Delgado
- (**server**) let the host configure the table from the lobby - ([ccce6d6](https://github.com/PixiBixi/uno-multiplayer/commit/ccce6d6b806b9e4ae26b55066c16d44d283f2c58)) - Jeremy Delgado
- (**web**) move the table configuration into the lobby - ([d3f744d](https://github.com/PixiBixi/uno-multiplayer/commit/d3f744de4250ddf27c32fd636b457d9b9b52d57d)) - Jeremy Delgado
#### Documentation
- (**spec**) the lobby owns the table configuration - ([3f1e0fd](https://github.com/PixiBixi/uno-multiplayer/commit/3f1e0fdcf08dd055edba9e6114c7b61ea3830ca1)) - Jeremy Delgado
- the lobby configures the table, not the home screen - ([5690891](https://github.com/PixiBixi/uno-multiplayer/commit/56908911f5454f31ef2ce68c8a6e3dae5a7b2b20)) - Jeremy Delgado
#### Tests
- (**e2e**) the guest watches the host toggle a rule, and the lobby is measured - ([913cfa5](https://github.com/PixiBixi/uno-multiplayer/commit/913cfa5c5cc2ccd11fa9067b86bad06fbc8fcbbd)) - Jeremy Delgado
#### Style
- format the drawn-card tests with Prettier - ([8cca339](https://github.com/PixiBixi/uno-multiplayer/commit/8cca3395400dfaf55a73c95aaff9f43d07b84d73)) - Jeremy Delgado

- - -

## [v1.1.0](https://github.com/PixiBixi/uno-multiplayer/compare/7e7a3ee5b507c5f803edfe96c8ed0fc4e3b9fc54..v1.1.0) - 2026-08-10
#### Features
- (**rules**) play the card you just drew, on by default - ([efc7440](https://github.com/PixiBixi/uno-multiplayer/commit/efc7440e48e124d776538e2c0f7197c04fc087c9)) - Jeremy Delgado
#### Documentation
- settle playing the card you just drew - ([7e7a3ee](https://github.com/PixiBixi/uno-multiplayer/commit/7e7a3ee5b507c5f803edfe96c8ed0fc4e3b9fc54)) - Jeremy Delgado

- - -

## [v1.0.1](https://github.com/PixiBixi/uno-multiplayer/compare/ee3a189a38f2d1aa205e132b7fcabc081c636a30..v1.0.1) - 2026-08-10
#### Bug Fixes
- (**server**) log the client, not the proxy - ([647b52c](https://github.com/PixiBixi/uno-multiplayer/commit/647b52c0c823ddf96be5e7096c4063d4ac163c64)) - Jeremy Delgado
#### Continuous Integration
- (**cog**) let the release image be published for an existing tag - ([ee3a189](https://github.com/PixiBixi/uno-multiplayer/commit/ee3a189a38f2d1aa205e132b7fcabc081c636a30)) - Jeremy Delgado

- - -

## [v1.0.0](https://github.com/PixiBixi/uno-multiplayer/compare/65dd7104aaa6c5e07346e420d9dacac147b35f89..v1.0.0) - 2026-08-10
#### Features
- (**engine**) score a match of rounds, official rules - ([c13e139](https://github.com/PixiBixi/uno-multiplayer/commit/c13e1390374596d818b0debb9e93e77225a24bea)) - Jeremy Delgado
- (**engine**) add seat transitions, absent-turn skipping and fix advance with one active seat - ([845f82d](https://github.com/PixiBixi/uno-multiplayer/commit/845f82d350385138c3dc9943bac56ee33cd53fac)) - Jeremy Delgado
- (**engine**) add applyMove with card effects, draw stacking, uno penalty and victory - ([41f3e4e](https://github.com/PixiBixi/uno-multiplayer/commit/41f3e4e8edacc2948f314f23e640d20b441f1a59)) - Jeremy Delgado
- (**engine**) add deck, deterministic init, playability and legal move enumeration - ([a6b46e8](https://github.com/PixiBixi/uno-multiplayer/commit/a6b46e8918128a2a27d630d8998b944d795e1ef7)) - Jeremy Delgado
- (**engine**) add seeded pure PRNG, non-mutating shuffle and domain types - ([e2521e4](https://github.com/PixiBixi/uno-multiplayer/commit/e2521e461360bcdb83b336c0edeec2ba56216b14)) - Jeremy Delgado
- (**protocol**) add wire contract with views, events and Zod payload schemas - ([f314ffd](https://github.com/PixiBixi/uno-multiplayer/commit/f314ffdb1a5bcf592cd638b221e995b14532cb0d)) - Jeremy Delgado
- (**rules**) jump-in, where an identical card may be played out of turn - ([3bab47a](https://github.com/PixiBixi/uno-multiplayer/commit/3bab47a9230436ba7f42ddd76f14bebfe7e3d313)) - Jeremy Delgado
- (**rules**) Seven-Zero, where a 7 swaps hands and a 0 rotates them - ([10af670](https://github.com/PixiBixi/uno-multiplayer/commit/10af670889d1e218cb0a5983d5e7eed75dc3de7c)) - Jeremy Delgado
- (**rules**) the Liar call-out, an optional manual UNO penalty - ([c801c24](https://github.com/PixiBixi/uno-multiplayer/commit/c801c24b1c3a039c629fd9221c70e6e193388a55)) - Jeremy Delgado
- (**server**) add host restart, static client serving and configurable rate limits - ([13ab6d3](https://github.com/PixiBixi/uno-multiplayer/commit/13ab6d3b07b1c7c31d80cffc9682a88f35627a58)) - Jeremy Delgado
- (**server**) add room directory, HTTP app and socket handlers - ([8c7c3ce](https://github.com/PixiBixi/uno-multiplayer/commit/8c7c3cea4a9016fde9ac11b1663b5cef7ae2cf0e)) - Jeremy Delgado
- (**server**) add room lifecycle with lobby, game flow, presence and derived events - ([0a462fc](https://github.com/PixiBixi/uno-multiplayer/commit/0a462fc40c1e99b74bef5a5eb541068b55790215)) - Jeremy Delgado
- (**server**) add workspace, validated config, room codes, view redaction and rate limiting - ([1d58f37](https://github.com/PixiBixi/uno-multiplayer/commit/1d58f37d3031930df016f5753b428f9f5ea5f83a)) - Jeremy Delgado
- (**web**) four card faces, chosen by each player - ([067257d](https://github.com/PixiBixi/uno-multiplayer/commit/067257da67d1e01b8db05bc4ca5f0304219f9179)) - Jeremy Delgado
- (**web**) the whole interface in English and French - ([d4a217d](https://github.com/PixiBixi/uno-multiplayer/commit/d4a217d5f02199bdbf497d5048078aa839475b13)) - Jeremy Delgado
- (**web**) i18n foundation, with each language owning its own grammar - ([c13b455](https://github.com/PixiBixi/uno-multiplayer/commit/c13b4551204af2eb3d45f72970d0e7fba8732d30)) - Jeremy Delgado
- (**web**) card values on the home page, derived from the engine - ([5fbc77f](https://github.com/PixiBixi/uno-multiplayer/commit/5fbc77f0390fbba0edc5c0d03f8b8a1eded6a1e9)) - Jeremy Delgado
- (**web**) catch a render error instead of blanking the table - ([d7dd0a2](https://github.com/PixiBixi/uno-multiplayer/commit/d7dd0a2996526228048b9af941cb9b7db4f1b9ee)) - Jeremy Delgado
- (**web**) synthesised sound, with endings that know who won - ([594731f](https://github.com/PixiBixi/uno-multiplayer/commit/594731fec6564c31b021d596854e6d5337a50899)) - Jeremy Delgado
- (**web**) copy the game code or an invite link from the lobby - ([7c534d6](https://github.com/PixiBixi/uno-multiplayer/commit/7c534d607994bbb151a7c8114c17f4259ada3407)) - Jeremy Delgado
- (**web**) animate calling UNO and drawing a card - ([63c3f63](https://github.com/PixiBixi/uno-multiplayer/commit/63c3f6389c0f651c2b03e5c37525355872bdb893)) - Jeremy Delgado
- (**web**) add play effects — a burst for action cards, a shake for wild +4 - ([27f6875](https://github.com/PixiBixi/uno-multiplayer/commit/27f687587736148d3a17d304a39adb88de5a8cea)) - Jeremy Delgado
- (**web**) add hand sorting, enlarge the playing area, fix two wording bugs - ([4c0b333](https://github.com/PixiBixi/uno-multiplayer/commit/4c0b333906a48bbe93d386ccae41985bc71eb0b7)) - Jeremy Delgado
- (**web**) add home, lobby, table, chat and end-of-game screens - ([a6e5fc1](https://github.com/PixiBixi/uno-multiplayer/commit/a6e5fc13851861cd4c3508a8e71858eac4b90889)) - Jeremy Delgado
- (**web**) add session storage, room URL handling and the game socket hook - ([ac39b60](https://github.com/PixiBixi/uno-multiplayer/commit/ac39b60f63cdc5275123bb3e0be0b7e9074cef4b)) - Jeremy Delgado
- (**web**) scaffold Vite React client with SVG card component - ([ee26d73](https://github.com/PixiBixi/uno-multiplayer/commit/ee26d73e6aa80c2a843873c805176ff2218b7377)) - Jeremy Delgado
- end-of-match awards, counted from the event feed - ([2183596](https://github.com/PixiBixi/uno-multiplayer/commit/21835962cc0d61aacfec2b01543d9e59f0fdf6c5)) - Jeremy Delgado
- Blazing mode — an optional per-turn clock, and self-dealing rounds - ([b288d9d](https://github.com/PixiBixi/uno-multiplayer/commit/b288d9dad9c4464c4fc476f37aa30e205bfcd1f3)) - Jeremy Delgado
- play a match of scored rounds, and fix the seat mapping it exposed - ([aa7378b](https://github.com/PixiBixi/uno-multiplayer/commit/aa7378b5a21d3f8350d365ca3e2d55e32189a0ad)) - Jeremy Delgado
#### Bug Fixes
- (**deploy**) stop stale build state leaking into the Docker image - ([64182a2](https://github.com/PixiBixi/uno-multiplayer/commit/64182a293c591e816a2606e2024d1549be86a497)) - Jeremy Delgado
- (**i18n**) the English left in the rendering layer, card labels first - ([52da80b](https://github.com/PixiBixi/uno-multiplayer/commit/52da80b276ce9031afdbdc928598db37d4faa29f)) - Jeremy Delgado
- (**i18n**) the hand-sort labels and every toast, in the player's language - ([ea60610](https://github.com/PixiBixi/uno-multiplayer/commit/ea606105024e6e00adbdcfca4482bf22e1751380)) - Jeremy Delgado
- (**server**) three ways a room outlived the people in it - ([e6b380f](https://github.com/PixiBixi/uno-multiplayer/commit/e6b380fb9492dd70fec53dee23d09e046f066d29)) - Jeremy Delgado
- (**server**) register the game:nextRound handler, which was never wired - ([e088052](https://github.com/PixiBixi/uno-multiplayer/commit/e08805257046820d3ea102d208134eb5d22a7467)) - Jeremy Delgado
- (**server**) stop breaking plain-HTTP deployments with TLS-only headers - ([b0932de](https://github.com/PixiBixi/uno-multiplayer/commit/b0932de61e08c3d9a33526a5444178327db9f746)) - Jeremy Delgado
- (**server**) move default port off 5000 and document the dev loop - ([e64a0ab](https://github.com/PixiBixi/uno-multiplayer/commit/e64a0abad463f8dd71e5a3188c7be41bb3b0e6d8)) - Jeremy Delgado
- (**web**) the draw pile stopped being covered by its own ghost card - ([e33f386](https://github.com/PixiBixi/uno-multiplayer/commit/e33f3864885e2e27c7283982a2a2f17e437e9aba)) - Jeremy Delgado
- (**web**) the language and card-theme controls, where they can be seen - ([81d11e0](https://github.com/PixiBixi/uno-multiplayer/commit/81d11e0ddaa19ef9fe6e6e932e631e978f318f91)) - Jeremy Delgado
- (**web**) show the card values instead of hiding them behind a click - ([2a43818](https://github.com/PixiBixi/uno-multiplayer/commit/2a43818e62397277a40e78d83550eab1e62e175c)) - Jeremy Delgado
- (**web**) keep the log inside its panel, and fix 'You is back' - ([88989fd](https://github.com/PixiBixi/uno-multiplayer/commit/88989fdeee75d444d496192ed59eefe1ecab695f)) - Jeremy Delgado
- (**web**) self-host the display font and drop ui-* generics - ([a343d1a](https://github.com/PixiBixi/uno-multiplayer/commit/a343d1a6c1f4460c9920115d918b58d5049c9eb5)) - Jeremy Delgado
#### Documentation
- (**plan**) complete plan C2 with Playwright and Docker delivery - ([0fb8f7d](https://github.com/PixiBixi/uno-multiplayer/commit/0fb8f7d2615a599311c068e0dc0a40f788f9819f)) - Jeremy Delgado
- (**plan**) add plan C2 tasks 7-8 (chat panel, table and end-of-game) - ([86a5046](https://github.com/PixiBixi/uno-multiplayer/commit/86a5046dc9075ba8c87e44829cacdaa1e3a392dc)) - Jeremy Delgado
- (**plan**) add plan C2 tasks 4-6 (lobby, seats, hand and colour picker) - ([320b494](https://github.com/PixiBixi/uno-multiplayer/commit/320b49485d06c5a4b2654a9ceb7f522c49879c31)) - Jeremy Delgado
- (**plan**) add plan C2 tasks 1-3 (session, socket hook, home screen) - ([441eab1](https://github.com/PixiBixi/uno-multiplayer/commit/441eab12f0a58e1193c575b8ddf6b0a2a6d4c72c)) - Jeremy Delgado
- (**plan**) add plan C1 (server restart, static serving, client scaffold, card component) - ([910313d](https://github.com/PixiBixi/uno-multiplayer/commit/910313d704ed201fb0ff633f5a62aa49f670a926)) - Jeremy Delgado
- (**plan**) complete plan B with room manager, HTTP app and socket handlers - ([b489a5e](https://github.com/PixiBixi/uno-multiplayer/commit/b489a5e72ee9bc18d9f92a6d7c44d2f537810dd7)) - Jeremy Delgado
- (**plan**) add plan B tasks 7-9 (room lobby, game flow, presence) - ([846ae15](https://github.com/PixiBixi/uno-multiplayer/commit/846ae159fbeade96f003f86fcc0c086c27525974)) - Jeremy Delgado
- (**plan**) add plan B tasks 1-6 (engine seat transitions, config, room codes, redaction, rate limiting) - ([9938067](https://github.com/PixiBixi/uno-multiplayer/commit/993806795562060f2d208c136f1efbd2ce12d34d)) - Jeremy Delgado
- (**plan**) complete plan A with reducer, invariants and protocol tasks - ([870d3f7](https://github.com/PixiBixi/uno-multiplayer/commit/870d3f74a9600f98d1c2c1e5fe97bd4dee8c5622)) - Jeremy Delgado
- (**plan**) add implementation plan A, tasks 1-6 (scaffolding, RNG, types, deck, init, rules) - ([ca16731](https://github.com/PixiBixi/uno-multiplayer/commit/ca1673128d71aa0983400d7bae711b9736fcbe6b)) - Jeremy Delgado
- (**spec**) add design for 2-4 player server-authoritative UNO - ([65dd710](https://github.com/PixiBixi/uno-multiplayer/commit/65dd7104aaa6c5e07346e420d9dacac147b35f89)) - Jeremy Delgado
- how a sweep for English is finished, and which tests decide it - ([a0b4831](https://github.com/PixiBixi/uno-multiplayer/commit/a0b4831937f5c77f8838a8ffe93a795ff401ff5a)) - Jeremy Delgado
- where a sweep for English stops, and two defects only numbers settled - ([22f4037](https://github.com/PixiBixi/uno-multiplayer/commit/22f40378aa3f67932dcd12a5d83f092367a9d157)) - Jeremy Delgado
- settle the design for player-chosen card themes - ([32d895e](https://github.com/PixiBixi/uno-multiplayer/commit/32d895efea0af362409def74a397d06bc5b4e0de)) - Jeremy Delgado
- settle the design for the Liar call-out and two variants - ([e3c9c51](https://github.com/PixiBixi/uno-multiplayer/commit/e3c9c51c5427c0c93d9c638ce2d7ef494e44fdfd)) - Jeremy Delgado
- an architecture wiki, and a repository CLAUDE.md - ([b18b2cd](https://github.com/PixiBixi/uno-multiplayer/commit/b18b2cdaa23ed2e1a3b61e5dee20f47bca80a87b)) - Jeremy Delgado
- the night's plan, and an analysis of a bot with offline play - ([f22e181](https://github.com/PixiBixi/uno-multiplayer/commit/f22e1818eb4150aba9c1b7cfaeff915fe682a6dd)) - Jeremy Delgado
- record the outstanding work, including the mobile hand bug - ([179f984](https://github.com/PixiBixi/uno-multiplayer/commit/179f9842c14d6803fe41feaa675ae8a94472b6aa)) - Jeremy Delgado
- deployment behind Traefik, verified against a real one - ([a2ad0d2](https://github.com/PixiBixi/uno-multiplayer/commit/a2ad0d235f06d051af62f48786ee6344d65b4034)) - Jeremy Delgado
#### Tests
- (**e2e**) add Playwright suite, Docker image and CI jobs - ([c8af492](https://github.com/PixiBixi/uno-multiplayer/commit/c8af492229e9b9815fec87d47f92f33a1d67f30a)) - Jeremy Delgado
- (**engine**) stop the property tests timing out under load - ([57a4efd](https://github.com/PixiBixi/uno-multiplayer/commit/57a4efdd74c1d9fe7c5cb49453817c6405fce638)) - Jeremy Delgado
- (**engine**) add property-based invariants and switch comments to English - ([486dffe](https://github.com/PixiBixi/uno-multiplayer/commit/486dffea55799505a384494bb8b486a402e0b88b)) - Jeremy Delgado
- (**i18n**) a guard that reads the source, and a game played in French - ([3b11501](https://github.com/PixiBixi/uno-multiplayer/commit/3b11501c075569049f78591fda0cfcfd4d1c56b0)) - Jeremy Delgado
- (**server**) drop a jump-in assertion the rules contradict - ([46499c8](https://github.com/PixiBixi/uno-multiplayer/commit/46499c86cfbe39acff69df7eab2ce0951419d94a)) - Jeremy Delgado
#### Continuous Integration
- (**cog**) keep prettier away from the changelog - ([9410046](https://github.com/PixiBixi/uno-multiplayer/commit/94100465482d0032c0f2f731b83204491d53c17f)) - Jeremy Delgado
- (**cog**) semantic versioning, and semver tags on the image - ([ae51395](https://github.com/PixiBixi/uno-multiplayer/commit/ae5139591c0fcc4264419f624a2071362cdfe5c1)) - Jeremy Delgado
- publish the probed image to GHCR on a green main - ([dcbc6b1](https://github.com/PixiBixi/uno-multiplayer/commit/dcbc6b1b33ed2867e6437d91442445dc2039cabd)) - Jeremy Delgado
- add GitHub Actions pipeline, dependabot, README and licence - ([62a3b26](https://github.com/PixiBixi/uno-multiplayer/commit/62a3b2669fa593c1804e79d5891ae3b998e16a3d)) - Jeremy Delgado
#### Refactoring
- (**web**) delete lib/phrase.ts, wholly superseded by the catalogues - ([3487b79](https://github.com/PixiBixi/uno-multiplayer/commit/3487b79613009f9fb674622f07828ebfa37b0f40)) - Jeremy Delgado
- (**web**) one palette, instead of the same tables in four files - ([1840830](https://github.com/PixiBixi/uno-multiplayer/commit/1840830eb638c56882a1a36378a968f2a9307539)) - Jeremy Delgado
#### Miscellaneous Chores
- (**repo**) scaffold npm workspaces monorepo with TypeScript, ESLint and Vitest - ([ae1570c](https://github.com/PixiBixi/uno-multiplayer/commit/ae1570ce196b860c7003f1f527a8c6debc39cdf3)) - Jeremy Delgado
- ignore zz-* browser verification artefacts - ([35854d0](https://github.com/PixiBixi/uno-multiplayer/commit/35854d0933d1e30650ee798a12a333992932fe1f)) - Jeremy Delgado

- - -

