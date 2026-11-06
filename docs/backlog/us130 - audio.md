# US130 - Audio

**User story**
As a learner, I want to hear a side of a card spoken in its language, so that I can learn how words sound.

## Deck settings
The deck edit view is assumed to exist.

- Each side has an "Audio" switch, in deck creation and in deck editing.
- Switching audio on opens a small modal with a language dropdown and OK and Cancel buttons.
- Cancel closes the modal without changes. If audio was just switched on, it goes back to off.
- Switching audio off needs no dialog.
- When audio is on, the chosen language is shown next to the switch. Tapping it opens the same modal to change it.
- The dropdown lists the languages for which the current device has a voice. A language already saved for the side stays shown even if this device has no voice for it.
- The deck stores only the language code per side (for example "th-TH"), no voice.

## Study view
- Every side with audio on shows a play button on the card face. Sides with audio off show none.
- Sound plays only when the button is tapped, never automatically.
- Tapping the button does not turn the card or trigger any swipe action.
- The whole text of the side is spoken, using the device's default voice for the saved language.
- Tapping again, or playing another side, stops the current sound.
- If the device has no voice for the side's language, the play button is hidden.
- Audio is not added to the card list or the card form.

## Acceptance criteria
- Audio and language can be set, changed and switched off for each side, when creating and when editing a deck.
- The play button speaks the side text in the chosen language, and works offline.
- On a device without a voice for the language, the play button is hidden and nothing breaks.
- The setting is stored per deck and side and does not depend on the device.

## Out of scope
- Cloud voices, voice selection, speech speed, autoplay, audio in the card form.
