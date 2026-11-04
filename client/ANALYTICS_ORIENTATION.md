# Site and orientation analytics

The site uses the existing GTM container `GTM-TTNGZ2H8`, not a second GA
initialization. Implementation is in `src/lib/analytics.js` and
`src/lib/usePageTracking.js`. All events carry `analytics_version: site_v2`
and `page_type` (`home`, `orientation`, `auth`, `formations`, `parents`, `app`,
`blog`, `metiers`, `schools`, or `other`).

## Pageviews and privacy

- The existing `Pageview` event and `pageUrl`, `pagePath`, `pageTitle` keys are
  preserved for compatibility. Map it to GA4's `page_view`, not to a new
  parallel pageview tag.
- One pageview per pathname transition. Query/filter/anchor changes do not
  create additional pageviews. URLs in the data layer exclude query strings
  and fragments, including Stripe session IDs and form/search parameters.
  Standard UTM attribution is preserved separately as `campaign_source`,
  `campaign_medium`, `campaign_name`, `campaign_id`, `campaign_content`,
  `campaign_term`: only 1-80 character ASCII letters/digits/underscore/dot/hyphen
  tokens are accepted, not arbitrary URLs, email addresses or free text.
- Admin routes, private school-portal routes, `/auth/callback`, and URLs with
  `access_token`, `refresh_token`, `token_hash`, or OAuth `code` are excluded.
  GTM can initialize once after a protected callback returns to a safe route.
- Custom event parameters use allowlists. No names, email addresses, account
  IDs, form values, chat messages, search text, answer labels, school levels,
  grades, department values, persona names, or recommended job/formation names
  are sent. Page titles/paths can identify public editorial/formation pages.
- Optional parameters are reset to `null` on each event: GTM must not reuse a
  previous question number, micro-step, result count, or authentication method.
- Existing service/school-sharing agreements are **not** analytics consent.
  Keep the appropriate consent requirements on the GTM tags.

## Orientation events

Existing event names are preserved. The current contract is
`orientation_flow: orientation_v2`, `orientation_questionnaire: inscription_v5`.
Use these dimensions to distinguish this funnel from historical v1/v3/v4 data.

| Event | When it fires | Useful parameters |
| --- | --- | --- |
| `orientation_flow_started` | Start button | `orientation_action` |
| `orientation_flow_resumed` | Saved answers are restored | `orientation_source`: `saved_progress` or `after_auth` |
| `orientation_load_failed` | Questionnaire cannot load | `orientation_error_stage` |
| `orientation_step_viewed` | A question, micro-step, analysis, or reveal is visible | `orientation_step`, `orientation_step_index`, `orientation_total_steps` |
| `orientation_question_answered` | An accepted answer, not repeated taps during transition | `orientation_question_number`, `orientation_question_category`, `orientation_answer_position`, `orientation_answer_count`, `orientation_question_format` |
| `orientation_micro_step_completed` | A complementary step is answered or skipped | `orientation_micro_step`, `orientation_selected_count`, `orientation_action`: `answer` or `skip` |
| `orientation_registration_required` | Authentication is needed before analysis | `orientation_step`, `orientation_action` |
| `orientation_analysis_started` | Authenticated analysis starts | `orientation_step` |
| `orientation_analysis_completed` | Results have been retrieved | `orientation_step` |
| `orientation_analysis_failed` | Answer submission, generation, or result retrieval fails | `orientation_error_stage`: `submit_answers`, `generate`, `results` |
| `orientation_formation_selection_changed` | An information checkbox changes | `orientation_action`: `select` or `deselect` |
| `orientation_step_completed` | Persona, formation, or job reveal is continued | `orientation_step`, `orientation_action`, `orientation_item_count`, `orientation_selected_count` |
| `orientation_flow_completed` | Open app after avatar reveal | `orientation_step`, `orientation_action` |

`orientation_answer_position` is the displayed position, not the scoring value.
For `orientation_question_format: agreement`, positions 1-4 are "Carrement",
"Plutot oui", "Plutot pas", "Pas du tout". Dilemma/legacy questions have two
choices, identified by `orientation_answer_count: 2` and format `dilemma` or
`legacy`. Do not compare answer positions across formats or historical versions.

The six complementary steps are `school_level`, `strong_subjects`,
`grade_confidence`, `formation_preferences`, `study_location`, `career_domains`.
Only their identifiers and number of selections are tracked, never the choices.
Step indices/totals are local to the questionnaire (20) or micro-profile (6);
other phases use their position in the eight-phase funnel.

Formation reveal is counted only after the result loading gates finish, not
when the loading screen first appears. `orientation_item_count` describes the
displayed national/partner cards; `orientation_selected_count` counts current
information selections. Selecting a checkbox is **not** a `generate_lead`.

## Other site events

| Events | Meaning / parameters |
| --- | --- |
| `site_cta_clicked` | Internal links to orientation, registration, or parents; `destination_path`, `navigation_area` |
| `site_navigation_clicked` | Other header/footer/app links; same parameters, no anchor/query values |
| `registration_started`, `registration_failed` | Valid email registration attempt / failed persistence; `method`, `auth_context`, `error_stage` |
| `sign_up` | Registration and required onboarding persistence finished, on the destination route |
| `login_started`, `login_failed`, `login` | Email/Google authentication attempt, failure, completed login; `method`, `auth_context` |
| `logout` | Local app session is cleared |
| `formation_results_viewed` | Loaded directory/explorer results; `formation_source`, `result_count`, `has_query`, `has_location`, `action`, `status` |
| `formation_search_failed` | Public directory search failed; `formation_source`, `error_stage` |
| `formation_selected`, `formation_detail_viewed` | Directory/explorer card clicked / detail loaded; `formation_source`: `national` or `partner` |
| `formation_outbound_clicked` | Explorer/partner school website or public Parcoursup link; `formation_source`, `action` |
| `formation_info_requested`, `formation_info_failed` | Partner information submission attempt / API failure; `formation_source: partner`, `error_stage` |
| `generate_lead` | API accepted a partner information request; `formation_source: partner`. HTTP 409 duplicates are not new leads |
| `app_activity_selected` | Dashboard activity button; `tool_id`, `navigation_area: dashboard` |
| `app_tool_opened` | Navigation to a functional tool route or motivation letter; `tool_id` (route slug) |
| `profile_updated`, `profile_update_failed` | Profile save result, no changed fields; `error_stage` on failure |
| `chat_message_sent`, `chat_reply_received`, `chat_reply_failed` | Chat request/reply lifecycle; `chat_mode`: `advisor` or `expert`, `status` |
| `share` | Successful native share, clipboard copy, or persona download from landing/orientation; `content_type`, `method`. Cancelled shares are not successes |
| `parent_training_cta_clicked` | A parents-page CTA opens the registration section |
| `parent_training_checkout_started`, `parent_training_checkout_redirected`, `parent_training_checkout_failed` | Checkout request, returned payment URL, or failure; `error_stage` |
| `parent_training_checkout_cancelled` | Cancellation return from checkout |
| `parent_training_payment_confirmed`, `parent_training_payment_pending`, `parent_training_payment_failed` | Server verification result, not the `checkout=success` query alone |
| `parent_training_booking_completed` | Calendly `event_scheduled` message from `https://calendly.com`, after confirmed payment. No attendee/booking payload is forwarded |

Successful auth events are queued in memory until the safe destination is
tracked, including OAuth returns. `auth_context` is `orientation` or
`standalone`. No event is sent from a token-bearing callback.

The current national formation page exposes external resources and orientation
CTAs, not an information-request form. National detail/outbound clicks must
not be counted as partner leads.

Payment confirmations are deduplicated per checkout session in the current
tab's `sessionStorage`; refreshing the receipt does not count again. No Stripe
identifier, amount, or customer data is sent. This is a funnel signal, **not**
a GA4 `purchase` event or an accounting/revenue source. Closing the tab,
cross-device returns, blocked analytics, or revisiting another payment can
affect client-side counts; Stripe/webhooks remain authoritative.

## GTM / GA4 configuration to publish

Code changes alone do not update the remote container. In GTM Preview:

1. Reuse the current Google tag/property. Disable its automatic pageview
   (`send_page_view: false`) and GA4 enhanced history-based pageviews so there
   is only the existing `Pageview` custom trigger for SPA navigation.
2. Set `page_location` on **all** tags to a sanitized URL variable
   (`window.location.origin + window.location.pathname`), not the raw Page URL.
   Set `page_referrer` to the referrer origin only (or empty). Apply the same
   private-route/auth-parameter exclusions to tags, including automatic
   collection; the code cannot prevent independently configured GTM tags from
   collecting the original URL. Do not enable automatic form-value collection.
3. Keep the `Pageview` trigger and send one GA4 `page_view` with
   `page_location = {{DLV - pageUrl}}`, `page_title = {{DLV - pageTitle}}`,
   `page_path = {{DLV - pagePath}}`. Also map the six `campaign_*` Data Layer
   Variables above to the same GA4 parameter names on this tag, to preserve
   UTM attribution without restoring raw query strings. These are campaign
   metadata, never search/form values; do not put personal data in campaign names.
4. Keep the orientation custom trigger `^orientation_`. Use event name
   `{{Event}}` and map the orientation parameters below plus common parameters.
5. Add a separate custom trigger for the other site events:

   ```text
   ^(site_(cta_clicked|navigation_clicked)|registration_(started|failed)|sign_up|login(_started|_failed)?|logout|formation_(results_viewed|search_failed|selected|detail_viewed|outbound_clicked|info_requested|info_failed)|generate_lead|app_(activity_selected|tool_opened)|profile_(updated|update_failed)|chat_(message_sent|reply_received|reply_failed)|share|parent_training_(cta_clicked|checkout_started|checkout_redirected|checkout_failed|checkout_cancelled|payment_confirmed|payment_pending|payment_failed|booking_completed))$
   ```

   Send GA4 event name `{{Event}}`; map site parameters plus common parameters.
   Do not add a catch-all trigger that also fires the pageview/orientation tags.
6. Create Data Layer Variables for:
   - Common: `analytics_version`, `page_type`.
   - Orientation: `orientation_flow`, `orientation_questionnaire`,
     `orientation_step`, `orientation_step_index`, `orientation_total_steps`,
     `orientation_question_number`, `orientation_question_category`,
     `orientation_answer_position`, `orientation_answer_count`,
     `orientation_question_format`, `orientation_micro_step`,
     `orientation_item_count`, `orientation_selected_count`,
     `orientation_source`, `orientation_action`, `orientation_error_stage`.
   - Site: `destination_path`, `navigation_area`, `method`, `auth_context`,
     `formation_source`, `result_count`, `has_query`, `has_location`, `action`,
     `status`, `error_stage`, `tool_id`, `chat_mode`, `content_type`.
   Keep the orientation/site parameter groups on separate tags to stay within
   GA4's event-parameter limits. Do not substitute previous values for `null`.
7. Register only dimensions/metrics needed in reports, especially `page_type`,
   `orientation_questionnaire`, `orientation_step`, `orientation_micro_step`,
   `formation_source`, `auth_context`, `tool_id`, counts/positions.
   Suggested key events: `sign_up`, `orientation_flow_completed`,
   `generate_lead`, `parent_training_payment_confirmed`,
   `parent_training_booking_completed`. Do not mark attempts/redirects or
   checkbox selections as conversions.
8. Validate successful, failed, retried and cancelled journeys in Preview and
   GA4 DebugView, then publish the container. Consent/ad blockers may prevent
   collection; the application must continue to work.

## Funnels and validation

- Orientation: `intro` -> `questions` -> `micro_profile` -> registration/login
  if needed -> `analysis` -> `persona` -> `formations` -> `metiers` -> `avatar`
  -> `orientation_flow_completed`. Use `orientation_step_viewed` and
  `orientation_step` for phase-level exploration, not question indices.
- Formations: results -> selection/detail -> information request ->
  `generate_lead`.
- Parents: CTA -> checkout started -> redirect -> payment confirmed -> booking.
- App: dashboard activity selected -> tool opened. Opening an activity is not
  evidence of completing it.

Run `npm run verify:analytics`. Unit checks validate contracts, parameter
resets, exclusions and the HTML bootstrap. Browser checks start/close their
own Vite server and simulate auth, APIs, checkout and Calendly. All external
requests (including Google) are intercepted; no test analytics are sent.