# Orientation Analytics

`OrientationFlow` emits privacy-safe custom events to the existing Google Tag
Manager container (`GTM-TTNGZ2H8`). The code never sends names, email addresses,
answer labels, career aspirations, formation names, or job names.

## Events

| Event | When it fires | Useful parameters |
| --- | --- | --- |
| `orientation_flow_started` | The user starts the questionnaire | `orientation_action` |
| `orientation_step_viewed` | A new questionnaire, micro-profile, analysis, or reveal step is visible | `orientation_step`, `orientation_step_index`, `orientation_total_steps` |
| `orientation_question_answered` | A question receives an answer | `orientation_question_number`, `orientation_question_category`, `orientation_answer_position` |
| `orientation_micro_step_completed` | A micro-profile step is completed or skipped | `orientation_micro_step`, `orientation_step_index`, `orientation_total_steps` |
| `orientation_registration_required` | The flow needs an account before analysis | `orientation_step`, `orientation_action` |
| `orientation_analysis_started` | The authenticated analysis starts | `orientation_step` |
| `orientation_analysis_completed` | The analysis is available | `orientation_step` |
| `orientation_analysis_failed` | Analysis generation fails | `orientation_error_stage` |
| `orientation_step_completed` | Persona, formation, or job reveal is continued | `orientation_step`, `orientation_action`, `orientation_item_count` |
| `orientation_flow_completed` | The user opens the app after the avatar reveal | `orientation_step`, `orientation_action` |

Every event also includes `orientation_flow: orientation_v1`.

## GTM Setup

1. In the existing GTM container, enable the built-in `Event` variable.
2. Create Data Layer Variables for these keys:
   - `orientation_flow`
   - `orientation_step`
   - `orientation_step_index`
   - `orientation_total_steps`
   - `orientation_question_number`
   - `orientation_question_category`
   - `orientation_answer_position`
   - `orientation_micro_step`
   - `orientation_item_count`
   - `orientation_action`
   - `orientation_error_stage`
3. Create one Custom Event trigger named `Orientation - all events` with the
   regular expression `^orientation_`.
4. Create one GA4 Event tag:
   - Event name: `{{Event}}`
   - Trigger: `Orientation - all events`
   - Event parameters: map each Data Layer Variable above to the identically
     named GA4 parameter.
5. In GA4 Admin, register the event-scoped custom dimensions for string
   parameters and event-scoped custom metrics for numeric parameters. Mark
   `orientation_flow_completed` as a key event/conversion.
6. Use GTM Preview and GA4 DebugView on `/orientation` before publishing the
   GTM container.

## Funnel

Build a GA4 funnel exploration from `orientation_step_viewed` using
`orientation_step` in this order:

`intro` -> `questions` -> `micro_profile` -> `analysis` -> `persona` ->
`formations` -> `metiers` -> `avatar`.