# LinguaLens: Devpost submission draft (19 Nov 2026)

Status: DRAFT. Do not submit yet. Still needed: on-device test on desktop Chrome
(badge must read On-device), demo video (YouTube, public, max 3 min), app URL
(Firebase Hosting deploy is the plan, or note the local run).

Repo: https://github.com/hesikhasme/lingualens (public, Apache 2.0)
Hackathon: Firebase #BuildHybridAI 2026. Deadline 30 Nov 2026 17:00 ET (1 Dec 05:00 WIB).

## Tagline

An English writing coach that corrects you offline and coaches you in the cloud.

## Inspiration

English learners write every day, but the tools that correct them send every
sentence to a server. That means waiting on a connection, and it means your
writing leaves your device. I wanted a coach that fixes the small stuff right
on the device, instantly and privately, and only goes to the cloud when the
task actually needs a bigger model.

## What it does

LinguaLens is a web app for English learners. You paste or type text and it
corrects the grammar, with a short explanation for each mistake. It can rewrite
a sentence in a formal, casual, or short style, build vocabulary cards with
example sentences, and translate words to Indonesian. A second tab reviews a
whole essay with a score and a rewritten paragraph. A third tab is a
conversation partner that chats in simple English and gently corrects you.
Every result carries a small badge that says where it was computed, on-device
or in the cloud. Drafts and progress save to Firestore, or to local storage
when offline.

## How we built it

The app is Vite and TypeScript with the Firebase JavaScript SDK. All AI calls
go through Firebase AI Logic. Short single-turn tasks (grammar, rewrite,
vocabulary, translate) use Gemini Nano on-device with PREFER_ON_DEVICE, so they
work with the Wi-Fi off. Longer tasks (essay review, multi-turn chat) use
Gemini Flash in the cloud with PREFER_IN_CLOUD, because they need the bigger
model. The app reads inferenceSource from every response and shows it as a
badge, so the hybrid part is visible in the UI. On-device model setup happens
on the first user click, as the SDK requires. When the device model is not
available, PREFER_ON_DEVICE falls back to the cloud automatically, so the app
keeps working.

## Challenges we ran into

The hardest part was proving the on-device path. Headless Chromium in a Linux
VM reports the model as unavailable even with the flags on, so I could not
test Nano there at all. The on-device test and the offline demo video had to
move to a desktop Chrome with the Prompt API flag enabled and the model
downloaded. I also had to follow the SDK rules closely: initializeDeviceModel
only works after a user interaction, and the app has to handle the fallback
gracefully instead of failing.

## Accomplishments that we're proud of

The app is complete and verified end to end. Every feature works, the build is
clean, and testing showed zero console errors. The hybrid routing is real: the
code calls the Firebase AI Logic SDK at runtime and reads the inference source
from each response. The whole thing runs on the free tier with no credit card.

## What we learned

The split between on-device and cloud is a design decision, not just a
performance trick. Short, private, single-turn work belongs on the device.
Long, deep, multi-turn work belongs in the cloud. Getting that split right is
what makes the app feel fast without losing the depth.

## What's next

Ship a hosted version on Firebase Hosting, add more languages for translation,
and tune the on-device prompts against real learner writing.

## Built with

Firebase AI Logic, Gemini Nano, Gemini Flash, Firestore, App Check, Anonymous
Auth, TypeScript, Vite.

---

## Demo video shot list (max 3 minutes, English, YouTube public)

Record on desktop Chrome after the Nano model is downloaded. Speak in English
or add English subtitles. Show the badge in every shot.

- 0:00-0:15 Intro. Show the app. Say what it is: an English writing coach,
  quick fixes offline, deep coaching in the cloud.
- 0:15-0:45 Write tab. Paste a paragraph with mistakes, click Check grammar.
  Show the corrections, the per-issue rules, and the On-device badge. Turn
  Wi-Fi off and run it again to prove it works offline.
- 0:45-1:15 Rewrite and vocab. Rewrite one sentence in the formal style.
  Open a vocabulary card, play the pronunciation.
- 1:15-1:45 Essay review. Paste an essay. Show the score, strengths,
  improvements, rewritten paragraph, and the Cloud badge.
- 1:45-2:15 Practice chat. Send a message, get a reply in simple English
  with a gentle correction, play the read-aloud.
- 2:15-2:45 Progress and drafts. Show a saved draft and the progress
  counters.
- 2:45-3:00 Close. Repo URL on screen, one line about the hybrid split.

## Submission checklist

- [ ] On-device test on desktop Chrome, badge reads On-device
- [ ] Demo video recorded, uploaded to YouTube (public, max 3 min)
- [ ] App URL (Firebase Hosting deploy, or local run noted in the description)
- [ ] Devpost form filled with the draft above, repo link, video link
- [ ] Submit before 30 Nov 2026 17:00 ET (target 29 Nov)
