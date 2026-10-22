# FlipStack — Product Specification

| Product | FlipStack | Version | 2.1 |
| :---- | :---- | :---- | :---- |
| Author | Sebastian |  |  |

Table of Content

# **Version History**

| Version  | What changed | Changes detail |
| :---- | :---- | :---- |
| 1 | Created together with gemini |  |
| 2.0 | Review with Claude | Swipe directions swapped: swipe left \= next side, swipe right \= previous side. “Needs Review” no longer re-queues the card for immediate review. Got It / Needs Review changes a known counter per card and direction, and the next card is drawn by weighted random (continuous learning, pulled forward from Phase 2). Sides in a study setup get roles: Question, Answer, Extra. Sides form a loop. Got It / Needs Review are available at any time, even on the question side. Horizontal swipes take precedence over vertical swipes. Multiple decks are supported; tags select the learning topic. Decks, cards and scores are always personal; sharing only via export/import. Login screen only for now (no sign-up screen). The audio play button moved into the MVP as its lowest-priority item. Offline studying is kept; counters are stored locally and synced. The initial word list is imported directly into the database, not through the app. |
| 2.1 | Incorporated review |  |

# 

# **1 Executive Summary**

FlipStack is a mobile-first, domain-agnostic web application for structured digital study cards. Unlike traditional 2-sided flashcard platforms, FlipStack features a symmetric 3-sided card architecture, allowing users to create, configure, and study complex multi-layer data (e.g., Foreign Script → Phonetics → Native Meaning, or Term → Formula → Example Application).

The initial core target use case is mobile-first, user-generated vocabulary and study decks with full customization over display sequence, side visibility, touch gesture navigation, and private user data isolation.

The first goal is a personal tool for the author’s own Thai learning. The author is a complete beginner and cannot read Thai script yet. Other users may be invited someday. The design stays generic wherever that adds little overhead. Marketing, differentiation and a unique selling point are out of scope for now.

# **2 Core Concepts & Data Model**

## **2.1 The 3-Sided Card Structure**

Cards are fully flexible and symmetric across three data slots:

* Side 1 (e.g., Thai Script / Problem Statement)  
* Side 2 (e.g., Phonetic Transliteration / Hint / Formula)  
* Side 3 (e.g., Native Translation / Answer / Explanation)

## **2.2 Multi-Tenancy Rules**

* **User Isolation:** All decks and cards belong strictly to an authenticated user (user\_id). Data is private by default and always.  
* Decks, their cards and their scores (counters) are always personal. There are no shared decks and no ownership or permission rules between users. Sharing, if ever needed, works only via export and import. 

## **2.3 Flexible Deck Schema**

**Deck-Level Metadata:**

* Define labels for 2 or 3 sides during deck creation (e.g., Label 1: Script, Label 2: Phonetic, optionally Label 3: Meaning).  
* Multiple decks per user are supported. One deck is enough to start; further decks are planned (e.g., Burmese, Khmer, possibly Karen). For these other languages only phonetics will be learned for now, so those decks have 2 sides (Phonetic, Meaning).

**Card Data Model:**

* Every card simply holds Side 1, Side 2, and Side 3 content.  
* Plus freely definable but reusable tags to group them.  
* Tags define the learning topic: a study can run on the whole deck or only on the cards with a chosen tag.  
* Storage: the card holds its sides as one JSON object (jsonb), e.g. {“s1”: “…”, “s2”: “…”, “s3”: “…”}; a missing key means an empty side. The deck’s labels define the side names. This keeps the model generic (a further side would not need a schema change).

**Content Formats:**

* Support for multi-line text, formulas, symbols, and graphics on any side. Full format support is the product vision; the MVP covers text only (see 5.1), the rest follows in Phase 2\.   
* **Optional Entry:** Card creation does not require all 3 fields. A card can store 1, 2, or 3 sides. A card with fewer than two sides is saved but is not studied until it is ready. This also lets you collect words you want to learn before you know their translation, for example to ask a teacher later.   
* **Symmetry:** No side is hardcoded as the “Front” or “Back.” Any side can act as the starting prompt or answer key during study sessions.  
* **Usage:** Once the deck is created, FlipStack will name the sides accordingly (e.g. for data entry or study initialization).  This means the card form, the study picker and the card list show the deck’s labels (e.g., “Phonetic”, “Meaning”) instead of “Side 2”, “Side 3”.

**Progress data:** counters are stored in their own table, one row per user, card and direction (user\_id, card\_id, direction, counter 0–10, last updated). A “direction” is defined by the study direction Question side and its required Answer sides (Extra sides do not count). Card content and counters are kept apart because counters change on every swipe while card content rarely changes.

# **3 Study Engine & Dynamic Navigation Logic**

## **3.1 Pre Session Initialization**

Before a study starts, the user makes two choices on one start screen:

* **Topic:** the whole deck or the cards with one tag (default: the whole deck).  
* **Direction:** which sides are asked and revealed, and in which order. 

Both remember the last choice, so a study usually starts with one tap on Start.

**Direction.** A direction is an ordered list of the deck’s sides, each with a role:

* **Question:** exactly one, always first.  
* **Answer:** at least one. Required and tested; it counts toward Got It / Needs Review. A card that lacks it is skipped.  
* **Extra:** optional. Shown if the card has it; it never skips a card and has no effect on the known counters.

The list order is the order in which the sides are revealed. A side that is not in the list is not used. In the picker the user taps the sides in the order they should appear and gives each a role. A deck keeps a few saved directions, defined by side position, not by label.

Stored as, for example: `[{side: 3, role: "question"}, {side: 2, role: "answer"}, {side: 1, role: "extra"}]`

Default: `[{side: 1, role: "question"}, {side: 2, role: "answer"}, {side: 3, role: "answer"}]`

Known counters belong to the question side and the answer sides, so changing only an Extra does not reset progress.

## **3.2 Dynamic Card Flipping & Auto-Skipping Logic**

During an active study sequence, the engine dynamically evaluates card rendering:

* **Session Filtering:** A side that is not in the defined direction is not shown.   
* **Skip Cards:** A missing content for Question or Answer skips the card . Only a missing Extra side never skips a card.  
* **Skip Sides:**  A side with missing content for Extra is skipped.  
* **Side loop:** the sides of a card form a loop. After the last side, the next swipe returns to the question; swiping the other way from the question goes to the last side. A small indicator (e.g., dots) shows the position in the loop.

## **3.3 Continuous Learning Stream**

* Every card has a **known counter** (0–10) per direction. It starts at 0 and never goes below 0 or above 10\.  
* **Got It:** counter \+1. **Needs Review:** counter −1.  
* Only **one next card** is decided in advance. Each time a card is shown, the following card is drawn by weighted random from the learning pool. Cards with a lower counter are shown more often; known cards are shown less often and will finally disappear at a score of 10\.  
* The learning pool is the whole deck or the cards with the chosen tag. Cards lacking a required side (Question or Answer) for the current direction are not in the pool.  
* Weight \= 10 − counter.  
* No special rule for new (never-seen) cards: they start at counter 0 like any card that was marked Needs Review for the first time.

## **3.4 Congratulations screen**

If all (filtered) cards are learned and show a score of 10, a congratulations screen is shown. Telling the user we are all done with this (topic) session.

# **4 User Interaction & Mobile Gesture Engine**

The MVP is optimized for high-speed, single-handed mobile usage.

                  \+-----------------------------------+  
                  |            SWIPE TOP              |  
                  |      ("Got It" / Next Card)       |  
                  \+-----------------------------------+  
                                    ^  
                                    |  
  \+-------------------+   \+-------------------+   \+-------------------+  
  |    SWIPE LEFT     |   |                   |   |    SWIPE RIGHT    |  
  | ( Next Side /     | \< |    CURRENT CARD   | \> |  ( Previous Side  |  
  |    Flip )         |   |                   |   |    / Flip )       |  
  \+-------------------+   \+-------------------+   \+-------------------+  
                                    |  
                                    v  
                  \+-----------------------------------+  
                  |           SWIPE BOTTOM            |  
                  |  ("Needs Review" / Next Card)     |  
                  \+-----------------------------------+

## **4.1 Gesture Controls**

* **Swipe Left:** Turn / flip to reveal the next configured active side on the current card.  
* **Swipe Right:** Turn / flip to previous side.  
* **Swipe Up:** Mark card as “Got It” → advances to next card. The card’s known counter goes up by 1\.  
* **Swipe Down:** Mark card as “Needs Review” → advances to next card. The card’s known counter goes down by 1 and the card returns through the weighted draw (see 3.3).  
* Swipe Up / Swipe Down work at any time, including directly from the question side (shortcut to the next card).

**Horizontal swipes take precedence over vertical ones**, so a quick horizontal swipe is not mistaken for Got It / Needs Review. Vertical swipes must be slightly more explicit:

* A swipe counts as horizontal if it moves further sideways than up/down; it needs only a short distance.  
* A vertical swipe must be clearly vertical and travel further (or be a fast flick).  
* In between (ambiguous diagonal), nothing happens and the card snaps back.  
* Starting values to tune on a real phone: horizontal about 40 px; vertical about 80 px and within about 30° of straight up/down.  
* While dragging up or down the card tints (e.g., green / red); releasing before the threshold cancels the swipe.

## **4.2 Fallback UI**

For desktop/non-touch browsers or accessibility, dedicated UI buttons with visual swipe indicators will mirror all touch gesture triggers.

* Tapping the card also turns to the next side.

# **5 Scope & Feature Roadmap**

## **5.1 MVP (Phase 1\)**

* Mobile-first responsive Web application UI (PWA enabled).  
* User authentication (Login) with private user data isolation via Supabase RLS. Login only for now; the sign-up screen is deferred.  
* Custom Deck Creation with user-defined 3-side labels. 2 or 3 labels; multiple decks.  
* Full 3-Sided Card CRUD (Create, Read, Update, Delete) with optional fields. The card list can be sorted by any side (e.g., to find cards that still lack a Script) and filtered by tag.  
* Support for multi-line text in unicode font (so we can write Thai script) on any side.  
* Learning Session start screen with topic and direction.  
* Weighted random card draw.  
* Touch/Swipe gesture engine (Right/Left \= Flip, Up \= Got It, Down \= Needs Review). Left \= next side, Right \= previous side; horizontal preferred over vertical.  
* Dynamic content auto-skipping & card skipping logic.  
* Browser IndexedDB integration for offline deck reading and studying. Includes offline counter updates with later sync.  
* Known counters and the continuous learning stream.  
* Tags as the way to choose a learning topic.  
* One-time import of the existing V0 word list directly into the database (outside the app, no import function in the app). The V0 list is plain text with Phonetic and English (sometimes German) separated by a dash. The import splits each line on the first “ \- ” (dash with spaces), since romanizations can contain hyphens.

## **5.2 Future Enhancements (Phase 2 & Beyond)**

* **Desktop UX:** Expanded layout with hotkey bindings (Space \= Flip, Up Arrow \= Got It, Down Arrow \= Needs Review).  
* **Bulk Import / Export:** CSV/JSON import for easy deck population. The first word list is imported directly into the database; an in-app import is not needed for that. Export/import remains the only way sharing could work (see 2.2).  
* **Sign up**.  
* **Data format:** Support for formulas, symbols, and graphics on any side.  
* **Language selection:** At deck init a language can optionally be defined for special font or audio use (Khmer, Burmese or others)   
* **Audio Integration:** Text-to-Speech (TTS) playback button per side (especially useful for phonetics and Thai pronunciation). A first version (play button for script sides) is in the MVP as the lowest priority; the per-side version stays here.  
* **Spaced Repetition Algorithm (SRS):** Smart schedule management based on long-term performance history per user.

## **Out of scope**

* **Inline deck sharing:** (the technical and rule-definition effort of shared decks does not meet the gain.)
* **Offline Data Entry** is not supported. (Show a message: „please connect to the Internet“)

# **6 Open Points**

These came up during the review and were not decided. They are listed here so nothing is lost.

1. **Known nuance of the weighted draw:** a card marked Needs Review (counter back at 0\) waits about as long as a never-seen card. In a large pool this can be a long gap; tags keep pools small. A “recently failed” boost could be a later refinement.

