# Atlasaur — visual design and UX review

Reviewed 16 September 2026 on the deployed application in the built-in browser.

**Recommendation: keep the antique-atlas identity and make the interface around it clearer.** The parchment, cartographic detail, restrained palette, and forgiving study loop give Atlasaur character. The largest gains will come from fixing responsive controls, separating decorative typography from utility text, explaining the map's states, and making practice choices and progress easier to find.

This is an observed product review, not a redesign implementation or a formal accessibility certification. Findings below distinguish reproducible defects from design judgments and browser-specific limitations.

## Coverage

| Journey or surface | Exercised |
| --- | --- |
| Fresh welcome, first question, partial/completed/caught-up study | Tested earlier in this same task during issue #54 acceptance testing; the current review builds on that evidence. |
| Returning learner | Reloaded with saved place/capital records and a completed daily expedition. |
| All four question modes | Name → Click, Shape → Name, Country → Capital, Capital → Click. Correct answers, misses, skips, keyboard submission, and minor misspelling. |
| Daily expedition | Completed all ten questions, inspected result, clicked Share, and returned to study. |
| Regional test | Completed South America's twelve countries, including a skipped Chile and its retry; inspected break and final summary. Started another test and stopped without answering. |
| Scope and focus | Continent selection, Eastern Africa focus, focus exit, territories on/off. |
| Settings and appearance | System/light appearance and Dark; progress statistics and selected states. |
| Map | Selection, reveal framing, wheel zoom, reset, regional framing; inspected rendered accessibility attributes. |
| Layouts | 1280 × 900 desktop, 390 × 844 phone dimensions, 320 × 568 compact phone dimensions. |

Not exercised: physical touch devices, actual mobile keyboards, screen-reader operation, offline/PWA installation, destructive progress erasure, every country, every capital alias, and cross-day streak transitions. Map clicks issued against a path's bounding-box center can fall outside irregular country shapes; those automation misses are not claimed as application grading bugs.

## Fix these first

### 1. Typed-answer forms overflow their container

**Priority: high. Reproduced and measured.**

At 1280 px desktop width, the sidebar is 320 px wide. Its answer form has 287 px available, but its contents occupy approximately 350 px. Submit extends to x=1327, beyond the 1280 px viewport, and the panel acquires horizontal scrolling. This affects the core answering action.

The same form overflows at 320 px phone width: 296 px available, roughly 350 px of content. At 390 px it fits.

Reproduce: open Settings → Shape → Name or Country → Capital, then use either of those narrow container sizes.

**Change:** allow the input to shrink, reserve space for Submit, and stack the action on very narrow containers if necessary. Size this by the answer panel's width, not only the window breakpoint. Keep Enter submission. Acceptance: no horizontal scrolling, and the entire input and Submit control remain visible at both tested widths.

Evidence: [desktop overflow](04-desktop-typed-overflow.png), [320 px overflow](08-small-phone-overflow.png).

### 2. Narrow-screen settings opens offscreen

**Priority: high. Reproduced twice.**

At 320 × 568 in capital mode, the header wraps and moves the settings button onto a second line. The settings popover remains aligned to that button's right edge. Its measured rectangle is x=−180 through x=108, width 288 px: most of the panel is outside the viewport.

**Change:** use a viewport-constrained sheet on phones, with a visible title and Close action. On wider screens, clamp popover placement to the available viewport. Do not rely on the settings button remaining at the far right of a single-line header.

Acceptance: every mode, territory combination, and header wrap keeps all settings reachable without horizontal scrolling.

Evidence: [offscreen settings](15-small-phone-settings-offscreen.png).

### 3. An unanswered test is called a clean run

**Priority: medium. Reproduced.**

Start a test, then immediately press Done. The result says “Test over,” “0/12,” “0%,” and “No misses — clean run!” Zero answers does not justify that praise, and 0% suggests failed knowledge rather than no attempt.

**Change:** show “No questions answered” with no accuracy percentage. For a partial test, distinguish questions attempted, correct answers, and remaining questions. Reserve “clean run” for a completed run with the intended success condition.

Evidence: [empty test](14-empty-test-clean-run.png).

### 4. Share gives no observable result in the built-in browser

**Priority: investigate. Environment-specific observation.**

On the completed expedition, clicking Share left the page unchanged, with no visible success or error message. The browser clipboard was empty afterward. No warning/error appeared in the captured console logs. This does not establish failure in every browser or a native sharing environment.

**Change:** make success and failure explicit. Provide a reliable “Copy result and link” fallback, with selectable text if clipboard access fails. Test unsupported and cancelled native-share paths as well as success. Keep Share secondary to the learner's next useful action.

Evidence: [expedition result](11-expedition-result.png).

## Visual direction

### Preserve the atlas; simplify the controls

The logo, paper texture, geographic linework, and historical display face belong together. Preserve those. The controls currently use the same decorative type treatment as the surrounding atlas, even for dense statistics and mode selectors. That weakens legibility and hierarchy.

Measured examples: status text and Done use 12 px type. The progress dialog uses IM Fell English for its 24 px heading, 14 px explanatory copy, and 16 px action labels. Those are distinct sizes, but the same expressive face makes small utility text work harder than it needs to.

**Suggested type roles:**

- Display face for branding, country names, and major headings, generally 24–32 px.
- A calmer, highly legible face for buttons, instructions, inputs, and statistics; retain a serif if that best preserves the identity.
- Main instructions around 16–18 px, secondary explanations around 14–16 px. Reduce reliance on 12 px text for information needed to make a decision.
- Keep small caps for occasional section labels, not the only distinction between many adjacent metrics.

These sizes are proposed design targets, not a claim that every current size is invalid. Judge them on physical phones too; screenshot softness is not evidence of a font-rendering defect.

Evidence: [desktop study](02-desktop-study.png), [mobile settings](07-mobile-settings.png), [expanded progress](01-desktop-progress.png).

### Bring the question and its controls together

On desktop, the question sits around the sidebar's vertical middle while the answer field and action sit at the bottom. There is a large empty gap between related elements. On phones, the world overview occupies a narrow horizontal band inside a tall map area, and the question sits below it.

The world is naturally wide: simply stretching or cropping the overview to fill the screen would introduce new problems. Instead:

- Group the prompt, answer input, and feedback in one stable area.
- Offer explicit zoom in/out and “World view” / “Fit region” controls, keeping the world overview available.
- Give a focused region more useful screen area without revealing the answer itself.
- Teach drag/pinch or wheel zoom once, when a small target first matters.
- Keep feedback in a predictable location; preserve the useful country reveal and geographic context.

On desktop, use the sidebar as a compact learning card rather than placing prompt and response at opposite ends. On mobile, keep the task text close enough to the map and response area that it is easy to refer back to it.

Evidence: [mobile typed question](05-mobile-typed.png), [desktop study](02-desktop-study.png).

### Give each map state a distinct visual meaning

In typed country recall, Australia was a strong ochre highlight while previously encountered countries and known Brazil also had warm fills. In regional focus, the selected region introduced another gold treatment. The active question, learning history, and geographic scope compete in the same family of colors, without a visible legend in the inspected screens.

Use a small, consistent visual vocabulary:

| Meaning | Proposed treatment |
| --- | --- |
| Current answer target in a shape question | Strong outline plus a distinct fill, with no answer-revealing text. |
| Previously encountered | Very subtle neutral fill. |
| Established learning record | Restrained hatch or other pattern, with a clear explanation of what the status means. |
| Correct reveal | Consistent green feedback treatment plus text. |
| Incorrect selection | Distinct outline and text; do not rely only on red. |
| Focused region | Subtle regional wash or boundary, subordinate to the current question. |

Add a compact “Map key” or first-use explanation. Use the same semantics in light and dark themes. Dark mode preserves the mood, but country boundaries and small labels are visually subdued and deserve a dedicated contrast/readability pass.

Evidence: [typed question](05-mobile-typed.png), [dark map](09-mobile-dark.png), [dark focus](10-mobile-focus-dark.png).

### Standardize action hierarchy

The dark filled action works well when it means “do the main thing.” Keep that convention. Outline buttons should mean optional continuation, with quiet links for disclosure and tertiary routes. Disabled inputs should remain legible but not compete with the active response action.

Current inconsistencies worth resolving:

- “Don't know” in study versus “Skip” in tests may describe the same learner intent, but the difference is not explained.
- “Got it” after study/expedition misses versus “Continue” after a test miss creates another small vocabulary shift.
- Test again is the dominant action after a test; Share is dominant after an expedition; the study ending intentionally makes further activity quieter.
- “Figures, focus and tests” looks like a centered text action without an obvious disclosure cue.

Choose consistent labels where the action is the same. Where behavior differs, explain the difference instead of relying on a changed word. Add a chevron and clear expanded state to the progress disclosure. Retain the genuine resting state introduced by #54.

## Make the application easier to understand

### Expose practice choices without making users finish first

During study, mode selection is under Settings; progress, focus, tests, and the daily expedition are mostly inside Done → Figures, focus and tests. This organizes features around implementation surfaces rather than the learner's intentions. The long settings panel mixes practice configuration, appearance, statistics, and deletion.

**Proposed structure:**

- **Practice:** country/capital topic, answer method, and region.
- **Progress:** learning history and recent improvements.
- **Daily expedition:** a clear optional challenge entry.
- **Settings:** appearance and local data management.

These can be compact controls rather than a large navigation bar. Keep the initial “Start a short round” route as the default and preserve the calm stopping screen. Learners should be able to inspect their progress or choose a region without first saying they are done.

Use learner-facing mode names:

| Current label | Suggested label |
| --- | --- |
| Name → Click | Find a country on the map |
| Shape → Name | Name the highlighted country |
| Capital → Click | Find the country from its capital |
| Country → Capital | Name the capital |

An alternative compact structure is Topic: Countries / Capitals plus Answer by: Map / Typing, accompanied by one plain-language example. Test comprehension before choosing the final wording.

### Explain the counts and learning categories

“1/12,” “15 coming back,” “0 of 10 new,” “Day 1,” and “Rounds finished 4 of 8” appear in different contexts. They represent different things but receive similarly small visual weight.

Prioritize one immediate progress signal, such as “Question 3 of up to 12,” with secondary “2 new places explored” and “Reviews available.” If early finishes remain normal, avoid implying twelve is a required quota.

In the progress view, Seen includes Known: South America showed Seen 12 and Known 11. These are overlapping totals, not adjacent stages that can be added together. Either explain the relationship or use non-overlapping categories such as Not started / Practicing / Established, with a separate Due for review count. Wording must accurately reflect the scheduler; avoid overstating durable memory.

On return, “15 coming back · 10 new · Day 1” describes workload before value. Add a short, truthful indication of prior learning, then make a suggested short practice route clear. Avoid inventing a time estimate until real session data supports it.

Evidence: [returning learner](16-returning-learner.png), [expanded progress](01-desktop-progress.png).

### Clarify what a test measures

The regional test was introduced as “All 12 countries, scored.” After eight correct answers, skipping Chile left the header at “8/12 done · 1 missed.” After visiting all twelve countries, a round break showed “11 of 12 right,” then Keep going returned to Chile. Finding it completed the test at “12/12 done,” “92% Right,” with Chile still listed as missed.

This is a useful learning exercise, but it combines a test, retries, and round pacing without clearly explaining the scoring model.

**Recommended behavior:** define and display a first-attempt score, then offer missed-country practice as an explicit next step. If automatic retries are retained, introduce it as a check with retries and distinguish first-attempt performance from later recovery. Mark recovered countries as recovered in the final list. Label the twelve-question intermission so it cannot be mistaken for the end of the entire test.

Also replace “Test me on these” when the scope is actually every country in the selected region or world. “Test all 12 countries in South America” is unambiguous.

Evidence: [test break](12-test-round-break.png), [completed test](13-test-complete.png).

### Treat likely spelling slips differently from knowledge misses

“Austrlia” was marked “You missed” with Australia revealed, while the unaccented “Brasilia” was correctly accepted as Brasília. Normalization already helps, but an obvious omitted letter still feels like a geography failure.

For an unambiguous near-match, offer a spelling correction or a confirmation path. Preserve strict distinction between genuinely different answers: Iran and Iraq should not be collapsed by a broad edit-distance rule. Keep the incorrect entry visible for learning, but make the active Continue action more prominent than the now-disabled Submit control.

Evidence: [typo feedback](06-mobile-typo-feedback.png).

### Make expedition endings useful at every score

The result card gives a date, ten-square score pattern, country list, Share, and Back to studying. It does not offer targeted review of the countries missed in that expedition. At 1/10, Share is still the strongest action.

Lead with a plain result, such as “1 of 10 found,” and a clear completion acknowledgment. Offer “Review these places” as an optional learning route. Keep sharing available but visually secondary. Make the meaning of filled and empty squares explicit; do not require learners to infer it.

### Preserve a selected region when adding territories

With only South America visible as selected, enabling territories added a selected Antarctica chip and immediately changed the question to Antarctica. Whether that comes from a hidden retained selection or another scope rule, the visible experience is surprising.

Adding territories should either stay within the currently selected regions or visibly explain newly added regions before the question changes. A scope summary such as “South America · 14 places” would make the effect of configuration clearer.

### Provide keyboard and assistive alternatives for the map

The inspected country paths had no role, accessible name, or tab stop, and the main map SVG had no accessible label. The settings dialog also lacked a label. The typed input and standard buttons do support normal keyboard actions, including Enter submission.

Label dialogs, make selected state understandable without color, and design keyboard navigation or a suitable alternative to pointer-only map selection. Do not expose the hidden answer as an accessible name in a shape-recall question. Validate with a real screen reader and keyboard walkthrough; this inspection alone is not a complete audit.

## Suggested delivery order

| Order | Work package | Why |
| --- | --- | --- |
| 1 | Responsive input and settings fixes; honest empty-test copy | Concrete failures with straightforward reproduction. |
| 2 | Typography, spacing, input/button rules, mobile settings sheet | Improves the entire product and establishes consistency. |
| 3 | Map key, clearer state treatments, zoom/region controls | Improves the central interaction and makes learning progress visible. |
| 4 | Practice/progress navigation, plain mode names, understandable statistics | Reduces hidden features and terminology burden. |
| 5 | Test scoring/recovery clarity, typo handling, expedition review/share behavior | Improves trust, usefulness, and return motivation. |

Keep the successful foundations: one clear initial action, immediate questions, country reveals with capitals/neighbors, local persistence without an account, useful retries, early finishes, and a Done state that stays finished.

## Suggested follow-up validation

Ask target adults to begin unaided, change region, try typing, explain one map color, locate their progress, finish a test, and stop. Observe whether they can tell the difference between a review and a new place, and whether the score matches their understanding of the session. Repeat on physical phones with the keyboard open and on small countries requiring zoom.

For the responsive fixes, cover 320 px and 390 px screens plus the desktop's 320 px sidebar. Include long names, capital mode, focus chips, and a scrolled settings sheet. Check that typing, submitting, closing settings, and returning to the map remain reachable.

## Browser state and artifacts

Restored all six standard continents, territories excluded, Name → Click, System theme, and the original viewport. Left the existing tab at Welcome back after a reload. No source changes, GitHub comments, or new issues were made for this review. The review added 27 answers, taking saved all-time answers from 24 to 51, and completed today's expedition in this browser. The test records remain saved; no progress was erased.

Screenshots are in the adjacent `ux-review` folder. Browser screenshots are evidence of layout and state; do not use their image compression to judge font sharpness.
