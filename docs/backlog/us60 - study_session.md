# User Story: US60 —  Study Session

### Standard Persona Format

* **As a** user,

* **I want to** review cards using fluid touch gestures with a weighted card-selection algorithm,

* **So that** cards I find difficult appear more frequently while mastered cards appear less often until the whole deck is learned.

### Detailed Feature & UX Behavior

* **Immersive Layout:**

  * Top header displays minimal progress: current pool status (cards remaining) and active card score indicator.

  * Bottom navigation bar is hidden to maximize vertical gesture space.

* **Next-Card Selection Algorithm (Study Engine Mechanics):**

  * **Pool Invalidation & Qualification:** Only cards with valid content for the active study direction (non-empty question/answer fields) and scores $< 10$ are included in the active queue.

  * **Weighted Random Selection:** The card selection for the next turn is calculated dynamically based on current card scores ($0 \le \text{score} < 10$):

    * Each eligible card in the active pool is assigned a selection weight $W$:
      

      $$
      W = 10 - \text{score}
      $$


    * *Effect:* Cards with lower scores have higher relative weights, ensuring less mastered cards appear more frequently.

  * **Immediate Repetition Prevention:** The engine prevents selecting the exact same card consecutively if the pool contains more than 1 eligible card.

* **3D Flip Mechanics & Side Navigation:**

  * **Horizontal Drag / Swipe / Tap:** Swiping left/right or tapping the card triggers a smooth 3D flip animation (`transform: rotateY`) revealing the next/previous configured side (e.g., Side 1 -> Side 2 -> Side 3).

* **Vertical Swipe Grading Engine:**

  * **Swipe Up ("Got It"):** Increases card score by +1 (capped at 10). Card animates upward off-screen with a temporary green tint/glow.

  * **Swipe Down ("Needs Review"):** Decreases card score by -1 (bounded to a minimum score of 0). Card animates downward off-screen with a temporary red tint/glow.

  * **Score & Persistence Handling:** Score changes update immediately in local store memory (`studyStore.ts`) and persist via the Active Record `Card` model.

* **Network Interception During Active Session:**

  * If network connection drops mid-session, active study continues uninterrupted using local memory store.

  * Score updates queue locally and synchronize to Supabase once connectivity is restored.

* **Session Completion:**

  * When all cards in the active session pool reach a score of 10 (or no cards remain in the queue), the study engine halts card rendering.

  * Displays a **"Congratulations!"** modal/screen summarizing session stats.

  * Primary CTA: **"Start New Session"** — navigates back to the Learning Session Start view (`/study/start`).

### UI Design Mapping

* **App Background:** `bg-app` (`#0B0F19`, `slate-950`).

* **Interactive Card Surface:** `bg-card` (`#1E293B`, `slate-800`), `rounded-3xl`, `p-6`, `shadow-2xl`, `border-2 border-slate-600`.

* **Gesture Feedback Tinting:**

  * Got It (Upward Drag): `bg-emerald-900/40`, `border-emerald-500`.

  * Needs Review (Downward Drag): `bg-rose-900/40`, `border-rose-500`.

* **Completion Screen:** `bg-card`, `rounded-3xl`, primary CTA `brand-primary` (`#6366F1`, `indigo-500`), `text-primary`.

### Acceptance Criteria (AC)

| ID | Test Scenario | Expected Outcome | 
| ----- | ----- | ----- | 
| **AC-01** | **Weighted Card Selection Algorithm** | Given an active pool of cards with varying scores, when the next card is selected, the engine calculates selection probabilities using $W = 10 - \text{score}$, prioritizing lower-scored cards. | 
| **AC-02** | **Consecutive Repetition Prevention** | Given the pool contains $> 1$ card, when the user grades a card, the engine ensures the same card is not selected immediately back-to-back. | 
| **AC-03** | **Horizontal Card Flip & Animation** | Given an active card is displayed, when the user swipes horizontally or taps the card, then a 3D flip animation occurs revealing the next side according to the study direction. | 
| **AC-04** | **"Got It" Swipe Up (+1 Score)** | Given a card is active, when the user swipes up past the threshold, then the card score increments by +1, the card animates up with a green feedback tint, and the next card in the pool renders. | 
| **AC-05** | **"Needs Review" Swipe Down (-1 Score)** | Given a card is active with a score $> 0$, when the user swipes down past the threshold, then the card score decrements by -1 (min 0), the card animates down with a red feedback tint, and the next card renders. | 
| **AC-06** | **Offline Local Persistence** | Given network connectivity is lost during a study session, when the user swipes cards, then scores continue updating locally without blocking the session flow. | 
| **AC-07** | **Session Completion Overlay** | Given all cards in the session reach score 10, when the final swipe occurs, then the session ends, displaying the congratulations overlay with a *"Start New Session"* button that routes back to `/study/start`. | 

### Technical Guidance

* **Architectural Placement:**

  * **View:** `app/src/views/ActiveStudyView.vue` (handling touch event listeners, swipe velocity calculations, and 3D CSS transition triggers).

  * **Store:** `app/src/stores/studyStore.ts` (manages active card queue, weighted probability sampling logic, score updates, and completion checks).

  * **Model:** `app/src/models/Card.ts` (handles persistent score syncing to Supabase via `@supabase/supabase-js`).