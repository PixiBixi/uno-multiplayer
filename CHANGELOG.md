# Changelog

- - -
## [v1.11.6](https://github.com/PixiBixi/uno-multiplayer/compare/3f56ddf81092d031a505442dcd1f55648806fb27..v1.11.6) - 2026-09-03
#### Miscellaneous Chores
- (**deps**) update coturn/coturn docker tag to v4.17 (#18) - ([3f56ddf](https://github.com/PixiBixi/uno-multiplayer/commit/3f56ddf81092d031a505442dcd1f55648806fb27)) - renovate[bot], renovate[bot]

- - -

## [v1.11.5](https://github.com/PixiBixi/uno-multiplayer/compare/1986956344b5fc593cfb3309d7c7fa54bf343e1e..v1.11.5) - 2026-09-03
#### Miscellaneous Chores
- (**deps**) pin dependencies - ([1986956](https://github.com/PixiBixi/uno-multiplayer/commit/1986956344b5fc593cfb3309d7c7fa54bf343e1e)) - renovate[bot]

- - -

## [v1.11.4](https://github.com/PixiBixi/uno-multiplayer/compare/b8e0b2caf490ee7bbb135af6d7a8befa59b37469..v1.11.4) - 2026-09-02
#### Miscellaneous Chores
- (**codeowners**) declare a single owner for every path - ([b8e0b2c](https://github.com/PixiBixi/uno-multiplayer/commit/b8e0b2caf490ee7bbb135af6d7a8befa59b37469)) - Jeremy Delgado

- - -

## [v1.11.3](https://github.com/PixiBixi/uno-multiplayer/compare/9cbef8193678033a0d0acdf617ee40367e80a581..v1.11.3) - 2026-09-01
#### Documentation
- (**security**) add a security policy - ([49e7937](https://github.com/PixiBixi/uno-multiplayer/commit/49e79376a86ff7b0745e1b06ebb77d97e21531e1)) - Jeremy Delgado
#### Tests
- (**jumpin**) deal further rounds so the drive stops failing on a shuffle - ([a80cbac](https://github.com/PixiBixi/uno-multiplayer/commit/a80cbacd17bb698bd1241ecf81f1e5d935a565c4)) - Jeremy Delgado
#### Continuous Integration
- (**hardening**) audit runner egress and maintain the pinned SHAs - ([9cbef81](https://github.com/PixiBixi/uno-multiplayer/commit/9cbef8193678033a0d0acdf617ee40367e80a581)) - Jeremy Delgado
- (**renovate**) move dependency updates from Dependabot to Renovate - ([030604e](https://github.com/PixiBixi/uno-multiplayer/commit/030604e3a1ecf0bd687c10ba0dc32d4e5de35219)) - Jeremy Delgado
- (**renovate**) drop the config, Dependabot already owns this repo - ([3496e18](https://github.com/PixiBixi/uno-multiplayer/commit/3496e188df6ec9e66592c7468eacb257dde771dd)) - Jeremy Delgado
#### Miscellaneous Chores
- (**deps-dev**) bump the dev-dependencies group with 5 updates (#11) - ([6a55b73](https://github.com/PixiBixi/uno-multiplayer/commit/6a55b731e2aee4373c530e2cba72e34ad05e38e4)) - dependabot[bot], dependabot[bot]

- - -

## [v1.11.2](https://github.com/PixiBixi/uno-multiplayer/compare/8925163fdf894c5422d126332652890484d30d57..v1.11.2) - 2026-08-28
#### Bug Fixes
- (**web**) restart the shout listener at once after a normal timeout - ([8925163](https://github.com/PixiBixi/uno-multiplayer/commit/8925163fdf894c5422d126332652890484d30d57)) - Jeremy Delgado
#### Documentation
- (**wiki**) a healthy shout session restarts immediately now - ([553fc11](https://github.com/PixiBixi/uno-multiplayer/commit/553fc11b93014843e0056b8dd12f88dd84c0d2e9)) - Jeremy Delgado

- - -

## [v1.11.1](https://github.com/PixiBixi/uno-multiplayer/compare/c84e0d7be5b50f616c47200fa427893431d9d25a..v1.11.1) - 2026-08-28
#### Bug Fixes
- (**web**) probe for speech only once voice is joined - ([c84e0d7](https://github.com/PixiBixi/uno-multiplayer/commit/c84e0d7be5b50f616c47200fa427893431d9d25a)) - Jeremy Delgado
#### Tests
- (**e2e**) hide the speech API from Playwright's Chromium - ([dd2d00a](https://github.com/PixiBixi/uno-multiplayer/commit/dd2d00a03391f2a28474c1fe537f2c2f6f6d422d)) - Jeremy Delgado

- - -

## [v1.11.0](https://github.com/PixiBixi/uno-multiplayer/compare/b99950cd506820677ddd04b807067d245d0b5efa..v1.11.0) - 2026-08-28
#### Features
- (**web**) call UNO by shouting the word, not by making a sound - ([7c215ed](https://github.com/PixiBixi/uno-multiplayer/commit/7c215edd55e8c38de24e01c107eea78d3461ef2e)) - Jeremy Delgado
- (**web**) surface the shout state and ask before using a cloud recogniser - ([e10ec02](https://github.com/PixiBixi/uno-multiplayer/commit/e10ec02dc3c97d8310c872e8ef700fc5026ec562)) - Jeremy Delgado
- (**web**) trigger the UNO shout on the word, not on any sound - ([f370fdc](https://github.com/PixiBixi/uno-multiplayer/commit/f370fdc89d90f2fcc916a61f3361767062de4fb7)) - Jeremy Delgado
- (**web**) store whether cloud speech recognition was accepted - ([53f388b](https://github.com/PixiBixi/uno-multiplayer/commit/53f388bad8aacdcf6c4a14e4f2e7398f1d91114e)) - Jeremy Delgado
- (**web**) add the shout listener over the Web Speech API - ([515d0aa](https://github.com/PixiBixi/uno-multiplayer/commit/515d0aa6b5f964e6a0479784bdfd6ceb8d775c65)) - Jeremy Delgado
- (**web**) add the pure matcher for a shouted "uno" - ([3e41918](https://github.com/PixiBixi/uno-multiplayer/commit/3e419184f6e8f95aee747fd7a77509da3c691c14)) - Jeremy Delgado
#### Bug Fixes
- (**web**) say so when the pack download never starts - ([b0734aa](https://github.com/PixiBixi/uno-multiplayer/commit/b0734aaba743bea879dec3e72abd1a067df46f0c)) - Jeremy Delgado
- (**web**) stop the shout recogniser once the game is over - ([0010f46](https://github.com/PixiBixi/uno-multiplayer/commit/0010f466d79b083594b724f6daa200e66e4ec0ec)) - Jeremy Delgado
- (**web**) fall back to the UNO button when the microphone is refused - ([162b668](https://github.com/PixiBixi/uno-multiplayer/commit/162b66837eacb9e8355abbc62837e51471ef6c07)) - Jeremy Delgado
- (**web**) restore the hook's JSDoc placement and tighten the no-button test - ([3bdd98f](https://github.com/PixiBixi/uno-multiplayer/commit/3bdd98fb9d6e801cd502b5fff21de1c0142ba73c)) - Jeremy Delgado
- (**web**) let the shout availability converge while the pack downloads - ([fbf0b48](https://github.com/PixiBixi/uno-multiplayer/commit/fbf0b48ee9402aab51efcf181cca21dfe54d9d45)) - Jeremy Delgado
- (**web**) style the shout download button and cover the checked cloud checkbox - ([368310a](https://github.com/PixiBixi/uno-multiplayer/commit/368310af545933398ed11d6b124e561da2337d93)) - Jeremy Delgado
- (**web**) ignore results from a shout recogniser already dropped - ([43dda95](https://github.com/PixiBixi/uno-multiplayer/commit/43dda950e6c331604aca0a6d1f125bc5cac74a3e)) - Jeremy Delgado
#### Documentation
- (**plans**) fix three tests the pre-flight scan found unable to fail - ([79e6f49](https://github.com/PixiBixi/uno-multiplayer/commit/79e6f49f5ed04574bbcf2be7fd2f5aab761faca3)) - Jeremy Delgado
- (**plans**) implementation plan for the UNO word recognition - ([be13dbe](https://github.com/PixiBixi/uno-multiplayer/commit/be13dbe3f0ee6c3ed3bebc213c4eb45c7b50f449)) - Jeremy Delgado
- (**specs**) stop the shout recogniser while the microphone is muted - ([f4a3458](https://github.com/PixiBixi/uno-multiplayer/commit/f4a345875c0d7348d52b740af8d0909f8b4ba7d1)) - Jeremy Delgado
- (**specs**) design real "uno" word recognition for the shout trigger - ([98b6619](https://github.com/PixiBixi/uno-multiplayer/commit/98b6619a0a39698898b82fea1a64478b134f1f67)) - Jeremy Delgado
- (**web**) tighten the HEARD comment to three lines - ([f5ce6cb](https://github.com/PixiBixi/uno-multiplayer/commit/f5ce6cbe4fc9deb4690becf8133c0e5720416375)) - Jeremy Delgado
- (**wiki**) the shout stops at the end screen and on a refusal - ([c5acf4d](https://github.com/PixiBixi/uno-multiplayer/commit/c5acf4da7dd021943584c3e9d8c0be0df20ccc52)) - Jeremy Delgado
- (**wiki**) the shout listens for the word, not for a level - ([03f6b59](https://github.com/PixiBixi/uno-multiplayer/commit/03f6b59811dc9ebaed2b13f4c62fe472a40108a2)) - Jeremy Delgado
- (**wiki**) explain the turn-order lap walk and fix a stray em dash - ([b99950c](https://github.com/PixiBixi/uno-multiplayer/commit/b99950cd506820677ddd04b807067d245d0b5efa)) - Jeremy Delgado
#### Tests
- (**web**) cover installShout and the download button - ([5c1cffc](https://github.com/PixiBixi/uno-multiplayer/commit/5c1cffca5ac1e6129f1e02a64bd2675dabfef58c)) - Jeremy Delgado
- (**web**) assert the shout listener is not reopened once voice leaves - ([35778b1](https://github.com/PixiBixi/uno-multiplayer/commit/35778b1ab831cb48460ccef609e33fbb378c6265)) - Jeremy Delgado
#### Miscellaneous Chores
- (**lint**) let tests assert on mocked methods - ([15fd781](https://github.com/PixiBixi/uno-multiplayer/commit/15fd781588dc5a44bfb4672b60d1c8b88b5c7cb6)) - Jeremy Delgado

- - -

## [v1.10.0](https://github.com/PixiBixi/uno-multiplayer/compare/63acaa1b66a295570950ca940e1506e2f0adb964..v1.10.0) - 2026-08-28
#### Features
- (**cards**) a sixth face, found rather than chosen - ([8a27816](https://github.com/PixiBixi/uno-multiplayer/commit/8a2781659cf34e91c9b63806af2579fdcc8d7727)) - Jeremy Delgado
- (**engine**) expose the order of play after the seat on turn - ([99b0d9f](https://github.com/PixiBixi/uno-multiplayer/commit/99b0d9ff79759b39c38df9bccf4e06d3af395df4)) - Jeremy Delgado
- (**protocol**) ship the order of play in every player view - ([100618c](https://github.com/PixiBixi/uno-multiplayer/commit/100618cda56f426379391219bc434fd8abfeefad)) - Jeremy Delgado
- (**voice**) call UNO by shouting it - ([63acaa1](https://github.com/PixiBixi/uno-multiplayer/commit/63acaa1b66a295570950ca940e1506e2f0adb964)) - Jeremy Delgado
- (**web**) tell two turn states apart by shape, and say who is up next - ([a6b24ad](https://github.com/PixiBixi/uno-multiplayer/commit/a6b24addb44c693d93fdf64cea954c749cbd9980)) - Jeremy Delgado
#### Bug Fixes
- (**web**) take the unplayable-card fade down to its floor - ([54f3b21](https://github.com/PixiBixi/uno-multiplayer/commit/54f3b21dcfdc3311f02410bc2c3ad85503aa5515)) - Jeremy Delgado
- (**web**) paint the turn slab per line, and put "À toi de jouer" back - ([f02ba22](https://github.com/PixiBixi/uno-multiplayer/commit/f02ba2250a2ca70eae839942bd85d4dead949e29)) - Jeremy Delgado
- (**web**) fade an unplayable card again, but only as far as it stays readable - ([d3ddd74](https://github.com/PixiBixi/uno-multiplayer/commit/d3ddd74c798ca255867a388ba79d1248c5d0bd08)) - Jeremy Delgado
- (**web**) tell a card's state by elevation instead of fading its pigment - ([f2b46d8](https://github.com/PixiBixi/uno-multiplayer/commit/f2b46d8feb7dc72942f8239195a57f3ccb05e2fa)) - Jeremy Delgado
- (**web**) make the turn slab hug its words instead of banding the table - ([96f610b](https://github.com/PixiBixi/uno-multiplayer/commit/96f610b78cb89e6ee2f98680e827deb605f9a885)) - Jeremy Delgado
#### Documentation
- (**wiki**) the card fade sits at 0.71 now, its floor - ([6921ed4](https://github.com/PixiBixi/uno-multiplayer/commit/6921ed4439643d5bddde97ebe4ab9aed2f73caa3)) - Jeremy Delgado
- (**wiki**) explain why the slab is an inline box - ([e5dda5b](https://github.com/PixiBixi/uno-multiplayer/commit/e5dda5bc0a29afd81032b0e9714e677f066bfc6e)) - Jeremy Delgado
- (**wiki**) note the fade is back, with the floor it now has - ([c26cb5b](https://github.com/PixiBixi/uno-multiplayer/commit/c26cb5b42e63c3b3f507d43cb8d4ea428e00dfb9)) - Jeremy Delgado
- (**wiki**) record the contrast the card fade was costing - ([57bdf5e](https://github.com/PixiBixi/uno-multiplayer/commit/57bdf5ea286c60a204f57bf53bcb735b61f0e790)) - Jeremy Delgado
- (**wiki**) record what the turn slab needs and why settle is shared - ([cdad9d4](https://github.com/PixiBixi/uno-multiplayer/commit/cdad9d443468a265741adb9dac67dd31aee1c077)) - Jeremy Delgado
- (**wiki**) document the two turn states and the up-next queue - ([aec2a84](https://github.com/PixiBixi/uno-multiplayer/commit/aec2a84056df9fe66f88aa8d271225f720a9aef4)) - Jeremy Delgado
- (**wiki**) document the hidden card face and shout-to-call-UNO - ([e650e3d](https://github.com/PixiBixi/uno-multiplayer/commit/e650e3d03de35917f5095736686564672f7abd76)) - Jeremy Delgado
#### Refactoring
- (**e2e**) share one settle helper instead of two copies - ([53d6165](https://github.com/PixiBixi/uno-multiplayer/commit/53d616560783ace37f5a410b9eec0d0d4080d173)) - Jeremy Delgado

- - -

## [v1.9.0](https://github.com/PixiBixi/uno-multiplayer/compare/826ab0adeef638bd94b807c8b27d147abe1f1a4e..v1.9.0) - 2026-08-26
#### Features
- (**protocol**) voice signalling events and schemas - ([4fc4fca](https://github.com/PixiBixi/uno-multiplayer/commit/4fc4fcad5f75d023bdb71e5fef0aee0e09087c05)) - Jeremy Delgado
- (**server**) relay voice signalling between seats - ([386b89a](https://github.com/PixiBixi/uno-multiplayer/commit/386b89a14add7d5740f2358f73d763c9e4a8598d)) - Jeremy Delgado
- (**server**) voice session membership kept outside Room - ([7ef8cde](https://github.com/PixiBixi/uno-multiplayer/commit/7ef8cdec39bd1ff3e6729356389b1e9acd6db02a)) - Jeremy Delgado
- (**server**) mint ephemeral TURN credentials from a shared secret - ([6334e76](https://github.com/PixiBixi/uno-multiplayer/commit/6334e76f446c060b85060e72debbc2c953eee666)) - Jeremy Delgado
- (**voice**) show your own seat in the session - ([b13a841](https://github.com/PixiBixi/uno-multiplayer/commit/b13a8412a77ce651f51fe3fc02bf0b54c22db5fc)) - Jeremy Delgado
- (**web**) voice panel with per-player mute and speaking cues - ([fb15cc7](https://github.com/PixiBixi/uno-multiplayer/commit/fb15cc7309f9314506e65f9b192b45e34ce40853)) - Jeremy Delgado
- (**web**) useVoice hook wiring peers to the socket - ([588dd13](https://github.com/PixiBixi/uno-multiplayer/commit/588dd13ab2fd4f67379c512157b74935b818998c)) - Jeremy Delgado
- (**web**) detect who is speaking from received audio - ([f22057e](https://github.com/PixiBixi/uno-multiplayer/commit/f22057e963e5d9ab6237b185a42c5a5830720555)) - Jeremy Delgado
- (**web**) WebRTC peer manager with a deterministic offerer - ([87856e6](https://github.com/PixiBixi/uno-multiplayer/commit/87856e658736965d46f6b8a14cf6de53c7743fe8)) - Jeremy Delgado
#### Bug Fixes
- (**voice**) give the panel a place in the layout and a style - ([2327a76](https://github.com/PixiBixi/uno-multiplayer/commit/2327a7699bd5b6f1adbf39eeafb8b7bc67bcb65c)) - Jeremy Delgado
#### Documentation
- (**voice**) ship a relay people can actually run - ([b993e3a](https://github.com/PixiBixi/uno-multiplayer/commit/b993e3a1feac22db35770dcc59079d83f9e3446e)) - Jeremy Delgado
- (**voice**) mark the design as implemented - ([56f445c](https://github.com/PixiBixi/uno-multiplayer/commit/56f445c9a605f2eb9a0327693ca057daf2452b25)) - Jeremy Delgado
- (**voice**) record what the implementation verified - ([99da6c5](https://github.com/PixiBixi/uno-multiplayer/commit/99da6c577b39ec5099b62447cf71ffcbca105853)) - Jeremy Delgado
- (**voice**) document the TURN configuration - ([646ce30](https://github.com/PixiBixi/uno-multiplayer/commit/646ce3035ccedbed4cd0b8216d17b3becb2b668c)) - Jeremy Delgado
- (**voice**) implementation plan for the voice chat - ([ec72149](https://github.com/PixiBixi/uno-multiplayer/commit/ec7214952df0db084f42ab3f1f60226fd3975f03)) - Jeremy Delgado
- (**voice**) design for mesh WebRTC voice chat - ([826ab0a](https://github.com/PixiBixi/uno-multiplayer/commit/826ab0adeef638bd94b807c8b27d147abe1f1a4e)) - Jeremy Delgado
- (**wiki**) document the voice chat subsystem - ([c0b17bb](https://github.com/PixiBixi/uno-multiplayer/commit/c0b17bbb78ed3a4c00121d6c06ee3eba1d31e576)) - Jeremy Delgado
#### Tests
- (**voice**) end-to-end voice link between two browsers - ([fdfa37b](https://github.com/PixiBixi/uno-multiplayer/commit/fdfa37be5ab3a7ec7253cfb2cb90336b9329cc52)) - Jeremy Delgado

- - -

## [v1.8.1](https://github.com/PixiBixi/uno-multiplayer/compare/3eb993740bf958c4e15e29f11b69a10a41d4c230..v1.8.1) - 2026-08-26
#### Bug Fixes
- (**cards**) one design language per card, and four glyph geometries measured - ([82cd291](https://github.com/PixiBixi/uno-multiplayer/commit/82cd2916b0a14e805f41911c91ce30b5ece5c473)) - Jeremy Delgado
#### Documentation
- (**wiki**) document the third UNO grace clock and forgotten-UNO timing - ([3eb9937](https://github.com/PixiBixi/uno-multiplayer/commit/3eb993740bf958c4e15e29f11b69a10a41d4c230)) - Jeremy Delgado

- - -

## [v1.8.0](https://github.com/PixiBixi/uno-multiplayer/compare/8c9296a3c700e0b5354d96b330c1f223d6746caa..v1.8.0) - 2026-08-25
#### Features
- (**rules**) three seconds to say UNO, instead of two cards on the spot - ([52bd07a](https://github.com/PixiBixi/uno-multiplayer/commit/52bd07ae05225137149346aead57cc00303926d3)) - Jeremy Delgado
#### Documentation
- (**wiki**) update client architecture doc for card-theme and layout changes - ([8c9296a](https://github.com/PixiBixi/uno-multiplayer/commit/8c9296a3c700e0b5354d96b330c1f223d6746caa)) - Jeremy Delgado

- - -

## [v1.7.4](https://github.com/PixiBixi/uno-multiplayer/compare/8f22c115df1393dbe00963285bbac2a473e70837..v1.7.4) - 2026-08-25
#### Miscellaneous Chores
- (**deps**) bump the production-dependencies group across 1 directory with 2 updates (#10) - ([8f22c11](https://github.com/PixiBixi/uno-multiplayer/commit/8f22c115df1393dbe00963285bbac2a473e70837)) - dependabot[bot], dependabot[bot]

- - -

## [v1.7.3](https://github.com/PixiBixi/uno-multiplayer/compare/a9a076f9530e640dc5fbfce3fcf95b0e2dcb9827..v1.7.3) - 2026-08-25
#### Bug Fixes
- (**server**) trust the proxy by address, since a hop count no longer can - ([a9a076f](https://github.com/PixiBixi/uno-multiplayer/commit/a9a076f9530e640dc5fbfce3fcf95b0e2dcb9827)) - Jeremy Delgado

- - -

## [v1.7.2](https://github.com/PixiBixi/uno-multiplayer/compare/bb9d3777560c0d7b82c9c47ad056fec8b5c176ed..v1.7.2) - 2026-08-25
#### Bug Fixes
- (**rules**) the host opened every round, and now only opens the match - ([bb9d377](https://github.com/PixiBixi/uno-multiplayer/commit/bb9d3777560c0d7b82c9c47ad056fec8b5c176ed)) - Jeremy Delgado
- (**web**) stop the draw button moving, and say whose turn it is where it shows - ([b1a2709](https://github.com/PixiBixi/uno-multiplayer/commit/b1a2709cde7d2dbb9ed33e531d30eea55a86401f)) - Jeremy Delgado

- - -

## [v1.7.1](https://github.com/PixiBixi/uno-multiplayer/compare/90145df5a969194c0774e5d0a5637f960b1043a6..v1.7.1) - 2026-08-25
#### Bug Fixes
- (**web**) hang every line of the log off the same left edge - ([90145df](https://github.com/PixiBixi/uno-multiplayer/commit/90145df5a969194c0774e5d0a5637f960b1043a6)) - Jeremy Delgado

- - -

## [v1.7.0](https://github.com/PixiBixi/uno-multiplayer/compare/db9c4f7c0a1f9a2a9e115311d9e0a46a7ca83302..v1.7.0) - 2026-08-25
#### Features
- (**cards**) a poster face, and a card whose pigment reaches the edge - ([db9c4f7](https://github.com/PixiBixi/uno-multiplayer/commit/db9c4f7c0a1f9a2a9e115311d9e0a46a7ca83302)) - Jeremy Delgado
- (**web**) rebuild the interface on paper and pigment - ([54d855b](https://github.com/PixiBixi/uno-multiplayer/commit/54d855ba5d8bc96c6dcf8e55b3d49d3fbc4ca7de)) - Jeremy Delgado

- - -

## [v1.6.2](https://github.com/PixiBixi/uno-multiplayer/compare/75466c08a772364b66b6d9e72e55f4d4f3f7eb1a..v1.6.2) - 2026-08-25
#### Bug Fixes
- (**i18n**) the exposed banner points at now, not the next turn - ([36612bb](https://github.com/PixiBixi/uno-multiplayer/commit/36612bbf62286864ba7e108f57b9ab8605dd0b1b)) - Jeremy Delgado
- (**rules**) let an exposed seat call UNO off turn - ([649ba5b](https://github.com/PixiBixi/uno-multiplayer/commit/649ba5bd03b678c58fd1c39e21226dc6900905ae)) - Jeremy Delgado
- (**web**) keep the UNO control up while somebody else is on turn - ([78233fa](https://github.com/PixiBixi/uno-multiplayer/commit/78233fa00e36f29bf2ae274d7245bd4568876775)) - Jeremy Delgado
#### Documentation
- (**wiki**) the late UNO is reachable while the accusation is - ([60f054e](https://github.com/PixiBixi/uno-multiplayer/commit/60f054e023002db1cd2b1b177e96943320be3006)) - Jeremy Delgado
- (**wiki**) verify is not the gate CI runs, and the hook that covers the rest - ([de6397f](https://github.com/PixiBixi/uno-multiplayer/commit/de6397f8196284354269e52835b514ed854d222a)) - Jeremy Delgado
- (**wiki**) the rules the table states, and the chore that cuts a release - ([75466c0](https://github.com/PixiBixi/uno-multiplayer/commit/75466c08a772364b66b6d9e72e55f4d4f3f7eb1a)) - Jeremy Delgado
#### Continuous Integration
- (**hooks**) format and lint the staged files before they reach CI - ([a7a2bff](https://github.com/PixiBixi/uno-multiplayer/commit/a7a2bff92e676bfca25ceafd99feef255d4bbd70)) - Jeremy Delgado
- (**wiki**) drop the local SessionEnd hook, now that it is global - ([f135b58](https://github.com/PixiBixi/uno-multiplayer/commit/f135b5819bfc4c72519d164eb5192a7d9a638fb4)) - Jeremy Delgado
- (**wiki**) update the wiki when a session ends - ([79840d2](https://github.com/PixiBixi/uno-multiplayer/commit/79840d2fac8e460c796f6e3298a27a894c8133fe)) - Jeremy Delgado

- - -

## [v1.6.1](https://github.com/PixiBixi/uno-multiplayer/compare/769b7da68db91a4d37a6ad67c036fecd96ab2365..v1.6.1) - 2026-08-23
#### Continuous Integration
- (**cog**) let a chore cut its own patch release - ([89d677c](https://github.com/PixiBixi/uno-multiplayer/commit/89d677cd0d344fd3d3da43f01a37fcae67570a68)) - Jeremy Delgado
- (**dependabot**) check actions and the base image daily - ([1dea0ac](https://github.com/PixiBixi/uno-multiplayer/commit/1dea0acf9f32b9835f1c72523c2fb75ed5ca3b39)) - Jeremy Delgado
- (**dependabot**) hold back the TypeScript major the dev group cannot install - ([7b517fc](https://github.com/PixiBixi/uno-multiplayer/commit/7b517fc46032ed07615a0ba3c0302af39de93b35)) - Jeremy Delgado
#### Miscellaneous Chores
- (**deps**) bump docker/setup-buildx-action from 4.2.0 to 4.3.0 - ([47be558](https://github.com/PixiBixi/uno-multiplayer/commit/47be5586d33acb7e90dceacb7a7a39dbe9c558f8)) - dependabot[bot]
- (**deps**) bump fastify - ([769b7da](https://github.com/PixiBixi/uno-multiplayer/commit/769b7da68db91a4d37a6ad67c036fecd96ab2365)) - dependabot[bot]
- (**deps-dev**) bump the dev-dependencies group across 1 directory with 2 updates - ([2144d6b](https://github.com/PixiBixi/uno-multiplayer/commit/2144d6b9e499d02d43146e3d10d6b0b1bd4a38ac)) - dependabot[bot]
- (**deps-dev**) take the five bumps TypeScript 7 was holding hostage - ([35f923e](https://github.com/PixiBixi/uno-multiplayer/commit/35f923ef62ff12227f9e3a56e2ebe741d42d7959)) - Jeremy Delgado

- - -

## [v1.6.0](https://github.com/PixiBixi/uno-multiplayer/compare/65e0f2ee37634aed86bdc9f36504591661a49126..v1.6.0) - 2026-08-23
#### Tests
- (**server**) deal another round rather than give up hunting a seven - ([c2fc694](https://github.com/PixiBixi/uno-multiplayer/commit/c2fc6947ca28442f27fbf15503e79f3c89e40beb)) - Jeremy Delgado
- (**server**) seed the socket table so the move test stops flaking - ([cd511a7](https://github.com/PixiBixi/uno-multiplayer/commit/cd511a763ca2c5ec7d236229b942470491ed59d8)) - Jeremy Delgado
#### Continuous Integration
- (**docker**) attest the image published on every green main - ([35c887f](https://github.com/PixiBixi/uno-multiplayer/commit/35c887f3c07e4370742bc140e805acccab0cb8cb)) - Jeremy Delgado
- pin every action by SHA and close the injection paths - ([65e0f2e](https://github.com/PixiBixi/uno-multiplayer/commit/65e0f2ee37634aed86bdc9f36504591661a49126)) - Jeremy Delgado
#### Miscellaneous Chores
- (**node**) move the runtime from 24 to 26 - ([1719658](https://github.com/PixiBixi/uno-multiplayer/commit/171965816ba69d96dc120f97c25db4a7f1cb371a)) - Jeremy Delgado
#### Style
- (**ci**) align the release workflow comments with prettier - ([80f90c0](https://github.com/PixiBixi/uno-multiplayer/commit/80f90c0d5b6b8377932d383e121a101691c3ca5f)) - Jeremy Delgado
- drop every em dash for a plain hyphen - ([093efcb](https://github.com/PixiBixi/uno-multiplayer/commit/093efcb8678ade948a5c68f3516363e034546018)) - Jeremy Delgado

- - -

## [v1.5.1](https://github.com/PixiBixi/uno-multiplayer/compare/99122adc657963853c0bf663b31b34e93495deab..v1.5.1) - 2026-08-11
#### Bug Fixes
- (**web**) state every rule at the table, not only the odd ones - ([99122ad](https://github.com/PixiBixi/uno-multiplayer/commit/99122adc657963853c0bf663b31b34e93495deab)) - Jeremy Delgado

- - -

## [v1.5.0](https://github.com/PixiBixi/uno-multiplayer/compare/6c683ed69044d3e79ef1fe8b72e900952cd314bc..v1.5.0) - 2026-08-11
#### Features
- (**web**) let the table say what it plays by - ([0ec3030](https://github.com/PixiBixi/uno-multiplayer/commit/0ec30304e799f38997460fca77858040cb2e102d)) - Jeremy Delgado
#### Documentation
- (**spec**) make the table say what is true - ([6c683ed](https://github.com/PixiBixi/uno-multiplayer/commit/6c683ed69044d3e79ef1fe8b72e900952cd314bc)) - Jeremy Delgado

- - -

## [v1.4.5](https://github.com/PixiBixi/uno-multiplayer/compare/b9df1db6dbe5aab957f71d6e5b44e358c371dc07..v1.4.5) - 2026-08-11
#### Bug Fixes
- (**web**) one room creation at a time - ([b9df1db](https://github.com/PixiBixi/uno-multiplayer/commit/b9df1db6dbe5aab957f71d6e5b44e358c371dc07)) - Jeremy Delgado
#### Documentation
- (**wiki**) the create limit, and a SHA tag that never existed - ([2b35133](https://github.com/PixiBixi/uno-multiplayer/commit/2b35133331e06af7289d97f89b4845cc578c5346)) - Jeremy Delgado

- - -

## [v1.4.4](https://github.com/PixiBixi/uno-multiplayer/compare/8e13a466b78e32b04ae4f99798c3fe1b9922e1aa..v1.4.4) - 2026-08-11
#### Bug Fixes
- (**server**) rate-limit room creation and compress socket frames - ([410500c](https://github.com/PixiBixi/uno-multiplayer/commit/410500c09f5d44fc6ab8a873c06a1a9f8b6285d4)) - Jeremy Delgado
- (**server**) release the seat when a socket moves to another table - ([8e13a46](https://github.com/PixiBixi/uno-multiplayer/commit/8e13a466b78e32b04ae4f99798c3fe1b9922e1aa)) - Jeremy Delgado

- - -

## [v1.4.3](https://github.com/PixiBixi/uno-multiplayer/compare/bd8461de63d7479b9d74691e3e360e265d8a3278..v1.4.3) - 2026-08-11
#### Performance Improvements
- (**protocol**) let the client drop the schemas it never calls - ([bd8461d](https://github.com/PixiBixi/uno-multiplayer/commit/bd8461de63d7479b9d74691e3e360e265d8a3278)) - Jeremy Delgado

- - -

## [v1.4.2](https://github.com/PixiBixi/uno-multiplayer/compare/1a8b91ce711517bf1ce8cab959aea18664f44cb1..v1.4.2) - 2026-08-11
#### Performance Improvements
- (**server**) compress responses and cache the hashed assets - ([f5200f7](https://github.com/PixiBixi/uno-multiplayer/commit/f5200f712c9ec50b6e22c7069b5c3cd629cc9102)) - Jeremy Delgado
#### Documentation
- make the README a landing page and the wiki the manual - ([1a8b91c](https://github.com/PixiBixi/uno-multiplayer/commit/1a8b91ce711517bf1ce8cab959aea18664f44cb1)) - Jeremy Delgado
#### Miscellaneous Chores
- (**deps**) bump @fastify/static in the production-dependencies group (#4) - ([1f45f74](https://github.com/PixiBixi/uno-multiplayer/commit/1f45f74e0be415bf66483c47a63714ff3c3c62a1)) - dependabot[bot]

- - -

## [v1.4.1](https://github.com/PixiBixi/uno-multiplayer/compare/cb7fa6ebf587ebd0fbc2724cba60b686a0e95678..v1.4.1) - 2026-08-10
#### Bug Fixes
- (**docker**) run the Node version CI actually validates - ([2e960c1](https://github.com/PixiBixi/uno-multiplayer/commit/2e960c10cff8067d7e1f4d9bf42e3cbfd64dfdd1)) - Jeremy Delgado
- (**i18n**) call it a call-out, not a lie - ([cb7fa6e](https://github.com/PixiBixi/uno-multiplayer/commit/cb7fa6ebf587ebd0fbc2724cba60b686a0e95678)) - Jeremy Delgado

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
- (**web**) add play effects - a burst for action cards, a shake for wild +4 - ([27f6875](https://github.com/PixiBixi/uno-multiplayer/commit/27f687587736148d3a17d304a39adb88de5a8cea)) - Jeremy Delgado
- (**web**) add hand sorting, enlarge the playing area, fix two wording bugs - ([4c0b333](https://github.com/PixiBixi/uno-multiplayer/commit/4c0b333906a48bbe93d386ccae41985bc71eb0b7)) - Jeremy Delgado
- (**web**) add home, lobby, table, chat and end-of-game screens - ([a6e5fc1](https://github.com/PixiBixi/uno-multiplayer/commit/a6e5fc13851861cd4c3508a8e71858eac4b90889)) - Jeremy Delgado
- (**web**) add session storage, room URL handling and the game socket hook - ([ac39b60](https://github.com/PixiBixi/uno-multiplayer/commit/ac39b60f63cdc5275123bb3e0be0b7e9074cef4b)) - Jeremy Delgado
- (**web**) scaffold Vite React client with SVG card component - ([ee26d73](https://github.com/PixiBixi/uno-multiplayer/commit/ee26d73e6aa80c2a843873c805176ff2218b7377)) - Jeremy Delgado
- end-of-match awards, counted from the event feed - ([2183596](https://github.com/PixiBixi/uno-multiplayer/commit/21835962cc0d61aacfec2b01543d9e59f0fdf6c5)) - Jeremy Delgado
- Blazing mode - an optional per-turn clock, and self-dealing rounds - ([b288d9d](https://github.com/PixiBixi/uno-multiplayer/commit/b288d9dad9c4464c4fc476f37aa30e205bfcd1f3)) - Jeremy Delgado
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

