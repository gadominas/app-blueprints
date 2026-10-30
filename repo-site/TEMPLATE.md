<!--
  README template for every app repository. Copy it to the app's README.md and replace every
  {{PLACEHOLDER}}. Keep the section names, their order and the header block exactly as they are,
  so all the repositories read the same. Rules: repo-site/REBUILD.md › 4.
  Sections marked (optional) are left out when the app has nothing for them; nothing else is.
-->
<div align="center">

<img src="docs/logo.svg" width="96" alt="{{NAME}} logo: {{LOGO_ALT}}">

# {{NAME}}

**{{TAGLINE}}**

{{PITCH_ONE_SENTENCE}}<br>An iPhone and iPad app for [Scriptable](https://scriptable.app). One file, no server, no sign-up.

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fgadominas%2F{{REPO}}%2F{{BRANCH}}%2Freleases.json&query=%24.releases%5B0%5D.version&label=version&color={{ACCENT_HEX}}&labelColor=0E1116&style=flat-square)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/iOS-Scriptable-171B22?style=flat-square&labelColor=0E1116)](https://apps.apple.com/app/scriptable/id1405459188)
[![AI](https://img.shields.io/badge/AI-{{AI_BADGE}}-171B22?style=flat-square&labelColor=0E1116)](#ai)
[![Blueprints](https://img.shields.io/badge/built%20with-app--blueprints-171B22?style=flat-square&labelColor=0E1116)](docs/BLUEPRINTS.md)
[![Last commit](https://img.shields.io/github/last-commit/gadominas/{{REPO}}?style=flat-square&labelColor=0E1116&color=171B22&label=updated)](https://github.com/gadominas/{{REPO}}/commits)
{{LICENSE_BADGE_OR_NOTHING}}

</div>

<p align="center">
  <img src="docs/screenshots/01-{{HERO_1}}.png" width="31%" alt="{{HERO_1_ALT}}">
  <img src="docs/screenshots/02-{{HERO_2}}.png" width="31%" alt="{{HERO_2_ALT}}">
  <img src="docs/screenshots/03-{{HERO_3}}.png" width="31%" alt="{{HERO_3_ALT}}">
</p>

> [!NOTE]
> Screenshots are rendered from the app's real interface with invented sample data. {{EXTRA_SCREENSHOT_NOTE}}

{{SPECIAL_DISCLAIMER_CALLOUT_OR_NOTHING}}
<!-- e.g.
> [!IMPORTANT]
> **Unofficial.** Not affiliated with … Use it with your own account and at your own risk. See [Disclaimer](#disclaimer).
-->

## Highlights

- **{{LEAD}}.** {{ONE_OR_TWO_SENTENCES}}
- …6 to 10 bullets, the app's key capabilities first, the shared ones (widget, launch screen, settings, AI, updates) last…

## Screenshots

<p align="center">
  <img src="docs/screenshots/04-{{ID}}.png" width="31%" alt="{{ALT}}">
  <img src="docs/screenshots/05-{{ID}}.png" width="31%" alt="{{ALT}}">
  <img src="docs/screenshots/06-{{ID}}.png" width="31%" alt="{{ALT}}">
</p>
<!-- rows of three, in shot order; the last row may hold one or two. Widget cards go in the last row. -->

## Install
<!-- Exactly as below, in every app (INSTALL-GUIDE.md). Only the end of step 3 and the "What else you need" bullets are the app's own.
     {{KEPT}} is install.kept from docs/site/repo.json, the same sentence the installer shows. -->

1. Get **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)** (free) on your iPhone or iPad.
2. In Scriptable, tap **+**, paste these two lines, name the script *{{NAME}} Installer*, and tap **▶**:
   ```js
   const code = await new Request("https://raw.githubusercontent.com/{{REPO}}/{{BRANCH}}/install.js").loadString();
   await eval("(async () => {" + code + "\n})()");
   ```
3. Tap **Open {{NAME}}**{{FIRST_RUN: the rest of the first run, e.g. " and sign in with your TAMO username and password."}}

To update, tap **Update now** when {{NAME}} offers a new version, or run *{{NAME}} Installer* again. {{KEPT}}

<details>
<summary><b>Install by hand</b></summary>

Rather not use the loader? Paste [`install.js`](install.js) or [`{{FILE}}`]({{FILE_URL}}) into a new script in Scriptable yourself.

</details>

What else you need:

- {{REQUIREMENT: anything else needed or worth doing (an account, an API key, a shortcut, a Home Screen icon), one short bullet each; leave the list out if there is nothing}}

## How to use it

{{APP_SPECIFIC: tasks the user does, as short subsections or a "To… / Do this" table.
  Long reference material (every option, every placeholder, worked examples) goes in <details> blocks
  so the page stays compact and nothing is lost.}}

## Widget

{{WHAT_THE_WIDGET_SHOWS}} It is the shared [widgets](https://github.com/gadominas/app-blueprints/blob/main/blueprints/widgets.md) blueprint, so all the apps' widgets look alike.

1. Long-press the Home Screen, tap **Edit › Add Widget**, choose **Scriptable** and a size.
2. Long-press the widget, tap **Edit Widget**, set **Script** to *{{SCRIPT_NAME}}* and **When Interacting** to *Run Script*.

Lock Screen widgets are added the same way under **Customize › Lock Screen**. {{WIDGET_REFRESH_NOTES}}

## AI

{{WHAT_AI_DOES_HERE}}

- **Your own key.** Open **Settings › AI settings**, add a [Claude](https://console.anthropic.com/settings/keys) or [OpenAI](https://platform.openai.com/api-keys) key, pick any model the key can use and tap **Test connection**. {{OTHER_ENGINES_IF_ANY}}
- **Kept safe.** The key is typed into a native iOS prompt, stored in the iOS Keychain and sent only to its own provider. The app's page never sees it.
- **You see the cost.** **AI settings › Token usage** shows tokens per day, feature and model. API use is billed by the provider, separately from any chat subscription.
- **Optional.** {{WITHOUT_A_KEY}}

## Settings

Tap the sliders icon at the top. Changes apply at once and are saved in `settings.json` in iCloud Drive › Scriptable › {{APP_FOLDER}}, so updates never reset them.

| Section | What you can change |
| --- | --- |
| Appearance | Colours (Auto or six palettes), layout (Comfortable, Compact, Tiny), text size, headline font |
| {{APP_SECTIONS}} | {{…}} |
| Updates | Offer new versions, check now |
| {{TUNABLES}} | {{…}}, each with Reset |
| Built with | The shared blueprints this app follows, with links (read-only) |

## Updates and what's new

{{NAME}} checks this repository for a new version each time it opens. When one is out, a sheet shows its three best features with **Update now** and **Later**; Later hides the offer for two days. Your data and settings are kept. Every release is in [CHANGELOG.md](CHANGELOG.md). {{APP_SPECIFIC_UPDATE_NOTES}}

## Privacy and security

- {{WHERE_DATA_LIVES}}
- {{WHAT_LEAVES_THE_PHONE_AND_WHEN}}
- AI keys stay in the iOS Keychain and are only sent to their own provider.
- The update check only downloads `releases.json` from this repository.

## How it works (optional)

{{HOW_IT_WORKS}}

## Troubleshooting (optional)

| Problem | Try this |
| --- | --- |
| {{…}} | {{…}} |

## Built with

- **[Scriptable](https://scriptable.app)** by Simon Støvring: one JavaScript file, a WebView for the interface.
- **[app-blueprints](https://github.com/gadominas/app-blueprints)**: the shared in-app updates, settings, AI configuration, launch screen and widgets that every one of these apps uses, so they look and behave alike. **Settings › Built with** lists the versions; [docs/BLUEPRINTS.md](docs/BLUEPRINTS.md) adds the deviations.
- {{CREDITS_OR_DATA_SOURCES}}

Maintainers: release notes live in [`releases.json`](releases.json); see [docs/RELEASING.md](docs/RELEASING.md). Screenshots are regenerated with [repo-site](https://github.com/gadominas/app-blueprints/tree/main/repo-site) from [`docs/site/scenario.js`](docs/site/scenario.js).

## Disclaimer

{{EVERY_SPECIAL_DISCLAIMER_IN_FULL}}

A personal project, provided as is, without warranty. {{NOT_AFFILIATED_LINES}}

## More apps like this

<p>
  <a href="https://github.com/gadominas/StravaFeed"><img src="https://raw.githubusercontent.com/gadominas/StravaFeed/main/docs/icon-1024.png" width="44" alt="Strava Daily Digest"></a>&nbsp;
  <a href="https://github.com/gadominas/BlogPulse"><img src="https://raw.githubusercontent.com/gadominas/BlogPulse/main/docs/icon-1024.png" width="44" alt="BlogPulse"></a>&nbsp;
  <a href="https://github.com/gadominas/VisionX"><img src="https://raw.githubusercontent.com/gadominas/VisionX/main/docs/icon-1024.png" width="44" alt="VisionX"></a>&nbsp;
  <a href="https://github.com/gadominas/Go2FGym"><img src="https://raw.githubusercontent.com/gadominas/Go2FGym/main/docs/icon-1024.png" width="44" alt="Go2FGym"></a>&nbsp;
  <a href="https://github.com/gadominas/Tamo-"><img src="https://raw.githubusercontent.com/gadominas/Tamo-/master/docs/icon-1024.png" width="44" alt="Dienynas+"></a>&nbsp;
  <a href="https://github.com/gadominas/Reading-Stars"><img src="https://raw.githubusercontent.com/gadominas/Reading-Stars/main/docs/icon-1024.png" width="44" alt="Reading Stars"></a>
</p>

<sub>Strava Daily Digest · BlogPulse · VisionX · Go2FGym · Dienynas+ · Reading Stars, all single-file Scriptable apps built on the same blueprints.</sub>

## License

{{LICENSE_LINE: "[MIT](LICENSE) © 2026 Gediminas Siutilas", or, without a LICENSE file, "No license has been chosen yet, so default copyright applies: ask before reusing the code."}} {{CONTRIBUTING_LINE}}
