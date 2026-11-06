# US130 — Audio Software Design

## Status

Design proposal for review. This document supplements US130; it does not change the story, Architecture, Coding Guidelines, PRD, or UI Design specifications.

## 1. Technical decisions

- Use the browser Web Speech API (`speechSynthesis` / `SpeechSynthesisUtterance`) with local voices only. Do not select or persist voice IDs; persist the language code and let the device supply its local voice.
- Persist enabled audio settings on the deck as a JSONB `audio_languages` object keyed by side (`s1`, `s2`, `s3`). An absent key means audio is off. For example: `{"s1":"th-TH"}`.
- Only locally synthesized voices (`SpeechSynthesisVoice.localService === true`) are selectable or playable. If the API is missing or there are no local voices, the Audio switch remains available; opening it shows “No language available” and disables OK. Cancel leaves a newly enabled side off.
- Language options are distinct locale codes from local voices. Keep a side’s saved code visible and selectable in its dialog even when the current device has no matching local voice. In that case, omit its play button.
- Do not add audio to card content, card list, or card form.

## 2. Files and responsibilities

| File | Change |
|---|---|
| `database/createDatabase.sql` | Add `deck.audio_languages JSONB NOT NULL DEFAULT '{}'` and a constraint requiring an object with only `s1`, `s2`, `s3` keys and non-empty string values. Reject `s3` when the deck has only two side labels. Keep the existing deck RLS policies. Add an update script 'update us130 - audio' at the end of the file. don't touch the existing lines.|
| `app/src/data/dataTypes.ts` | Add the typed audio-language map to `DeckRow`. |
| `app/src/data/remoteSource.ts` | Add the map to `DeckInput`; include it in deck insert/update payloads and preserve it in downloaded deck rows. |
| `app/src/models/deck.ts` | Own and validate per-side audio settings and include them in Active Record persistence and parsing. |
| `app/src/views/DeckEditView.vue` | Add a draft audio-language map to the existing create/edit form and commit only confirmed dialog selections. |
| `app/src/components/AudioLanguageDialog.vue` | New focused dialog for selecting a language, including the empty-voice state and OK/Cancel behavior. |
| `app/src/composables/useSpeechSynthesis.ts` | New browser-API composable for local-voice discovery, speech, cancellation, and speech errors. |
| `app/src/views/StudyView.vue` | Add a play control for the current side when its saved language has a local voice; keep the control outside the gesture-handling study stage. |
| `app/src/__tests__/deck.spec.ts` | Cover audio-language validation, persistence payload, parsing, and legacy rows without the new field. |
| `app/src/__tests__/DeckEditView.spec.ts` | Cover per-side settings, confirmation/cancel, switching off, and the empty-voice dialog state. |
| `app/src/__tests__/StudyView.spec.ts` | Cover playback availability, text/language passed to speech, stopping playback, and gesture isolation. |
| `app/src/__tests__/useSpeechSynthesis.spec.ts` | New focused tests for local voice discovery, `voiceschanged`, unsupported browsers, playback, cancellation, and speech errors. |

`DataRouter.saveDeck()` and `LocalSource` already pass and store complete deck rows; retain that flow. Update any explicit remote select/projection or test fixture that does not currently preserve all deck columns. No new Pinia store or persistence abstraction is needed. The IndexedDB schema has no new table or index, so a Dexie version bump is not required; treat a missing `audio_languages` value in an existing local row as `{}`.

## 3. `Deck` model — `app/src/models/deck.ts`

Define exported types for the supported side numbers (`1 | 2 | 3`), side keys (`s1 | s2 | s3`), and partial side-to-language map. Add a mutable `audioLanguages` property, defaulting to `{}` in the constructor so existing call sites remain valid.

Add these public methods:

- `getAudioLanguage(side: DeckSide): string | null` — return the configured code or `null`.
- `setAudioLanguage(side: DeckSide, languageCode: string): void` — validate that the side exists on this deck and that the code is a valid, non-empty language tag before setting it.
- `clearAudioLanguage(side: DeckSide): void` — remove the side's setting, thereby switching audio off.

Extend `validate()` to reject unknown side keys, invalid language tags, and audio settings for sides not present in `sideLabels`. Extend `save()` to include `audio_languages` in its `dataRouter.saveDeck()` input. Extend `fromJSON()` to parse and validate the map; for backward compatibility only, treat a missing field as `{}`. Continue to reject malformed present values.

## 4. Speech composable — `useSpeechSynthesis.ts`

Export `SpeechLanguageOption` (`code` and display `label`) and `useSpeechSynthesis()`. The composable exposes:

- `languages` — distinct language codes from currently available local voices, with readable labels.
- `hasLocalVoice(languageCode: string): boolean` — true only for an exact locale match among local voices.
- `speak(text: string, languageCode: string): void` — cancel any current utterance, then speak the full supplied text using a matching local voice; prefer a matching voice marked default, otherwise use the first matching local voice. Do not use a remote voice as fallback.
- `stop(): void` — cancel current speech.
- `isSpeaking` and `error` — reactive playback state and a surfaced synthesis error for the view.

Read voices with `speechSynthesis.getVoices()` and refresh on `voiceschanged`; remove the listener on unmount. If `speechSynthesis` is unavailable, expose an empty language list and no playable languages. Log synthesis errors with context and expose a user-readable error rather than silently treating a failed utterance as success.

## 5. Deck editor and language dialog

### `DeckEditView.vue`

Maintain the audio map as draft state alongside `deckName` and `sideLabels`. Initialize it from the loaded deck in edit mode and empty for a new deck. Render one Audio switch per visible side; when enabled, show its language label as a button that reopens the dialog. Turning audio off removes that side's draft code. If switching from two to three sides, initialize the new side as off; when reducing to two sides, discard the hidden third-side setting before save.

The view owns the transaction: enabling a side or changing its language opens `AudioLanguageDialog`; only its confirm event changes the draft map. Cancel leaves an existing value unchanged and returns a newly enabled switch to off. Save the draft map through the `Deck` model. Do not mutate the loaded deck until the user confirms the form save.

### `AudioLanguageDialog.vue`

Use the existing native `<dialog>` pattern. Accept the side label, available language options, and current language code; emit `confirm(languageCode)` and `cancel`. Include the current saved code in the options even if unavailable locally. With no selectable code for a newly enabled side, show “No language available”, disable OK, and leave Cancel active. Keep focus and keyboard dismissal consistent with the existing dialog patterns.

## 6. Study view playback

In `StudyView.vue`, derive the current side's saved language from `deckStore.activeDeck` and check it with `hasLocalVoice()`. Render no play button if either value is absent. Otherwise render a semantic button visually over the current card face but outside `.study-stage`, whose pointer handlers implement flip and rating gestures. It must not be a child of the gesture-handling element.

Add a typed `playCurrentSideAudio(): void` handler. It passes the complete current-side text and saved locale to the composable. Tapping the active play button again stops speech; starting playback for a different side cancels the previous utterance first. Stop playback when the visible side changes, the card is rated/replaced, the study view unmounts, or playback errors. Keep the button independently keyboard-accessible and provide an accessible name that identifies the side.

## 7. Validation

- Model tests verify valid two/three-side maps, rejection of invalid side keys/codes, absence of hidden-side settings, round-trip parsing, save payload, and a legacy row defaulting to no audio.
- Editor tests verify that Cancel makes no changes, OK saves only the selected locale, off removes the setting, and no local voices cannot enable a new setting.
- Composable tests verify that remote voices are excluded, locale codes are deduplicated, the voice list refreshes on `voiceschanged`, and speech is cancelled/reported correctly.
- Study tests verify the button is present only for a configured side with an exact local voice, whole text and locale are spoken, repeated playback toggles off, playback stops on side/card/view transitions, and interacting with the button does not flip or rate the card.
